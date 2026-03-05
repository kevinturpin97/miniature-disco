"""Tests for Sprint 23 — Data Pipeline & Long-Term History.

Covers LTTB downsampling, daily aggregation, retention policy enforcement,
cold storage archival, partition management, and the SSE streaming endpoint.
"""

from __future__ import annotations

import math
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from apps.iot.data_pipeline import (
    _format_bytes,
    aggregate_daily_readings,
    archive_to_cold_storage,
    enforce_retention_policies,
    lttb_downsample,
)
from apps.iot.models import (
    DataArchiveLog,
    RetentionPolicy,
    SensorReading,
    SensorReadingDaily,
    SensorReadingHourly,
)


# ---------------------------------------------------------------------------
# LTTB downsampling — pure unit tests (no DB required)
# ---------------------------------------------------------------------------


class TestLttbDownsample:
    """Unit tests for the LTTB algorithm."""

    def test_returns_unchanged_when_fewer_points_than_target(self):
        data = [{"timestamp": i, "value": float(i)} for i in range(5)]
        result = lttb_downsample(data, 10)
        assert result == data

    def test_returns_unchanged_when_equal_to_target(self):
        data = [{"timestamp": i, "value": float(i)} for i in range(10)]
        result = lttb_downsample(data, 10)
        assert result == data

    def test_returns_unchanged_when_target_less_than_3(self):
        data = [{"timestamp": i, "value": float(i)} for i in range(100)]
        result = lttb_downsample(data, 2)
        assert result == data

    def test_empty_input(self):
        assert lttb_downsample([], 10) == []

    def test_single_point(self):
        data = [{"timestamp": 0, "value": 1.0}]
        assert lttb_downsample(data, 10) == data

    def test_output_length_equals_target(self):
        data = [{"timestamp": i, "value": float(i)} for i in range(1000)]
        result = lttb_downsample(data, 50)
        assert len(result) == 50

    def test_preserves_first_and_last_points(self):
        data = [{"timestamp": i, "value": float(i)} for i in range(200)]
        result = lttb_downsample(data, 20)
        assert result[0] == data[0]
        assert result[-1] == data[-1]

    def test_timestamps_are_monotonically_increasing(self):
        data = [{"timestamp": i, "value": float(i) ** 2} for i in range(500)]
        result = lttb_downsample(data, 30)
        for i in range(1, len(result)):
            assert result[i]["timestamp"] > result[i - 1]["timestamp"]

    def test_preserves_extra_keys(self):
        data = [
            {"timestamp": i, "value": float(i), "sensor_id": 42, "label": "temp", "_row": {"period": f"2024-01-{i:02d}"}}
            for i in range(100)
        ]
        result = lttb_downsample(data, 10)
        for point in result:
            assert point["sensor_id"] == 42
            assert point["label"] == "temp"
            assert "_row" in point

    def test_sine_wave_preserves_peaks(self):
        """LTTB should keep points near peaks and troughs of a sine wave."""
        n = 1000
        data = [
            {"timestamp": i, "value": math.sin(2 * math.pi * i / 100)}
            for i in range(n)
        ]
        result = lttb_downsample(data, 50)

        # Extract values for peaks close to 1.0 and troughs close to -1.0
        values = [p["value"] for p in result]
        assert max(values) > 0.9, "Should preserve at least one peak near 1.0"
        assert min(values) < -0.9, "Should preserve at least one trough near -1.0"

    def test_large_dataset(self):
        """Downsample 10000 points to 100."""
        data = [{"timestamp": i, "value": float(i % 50)} for i in range(10000)]
        result = lttb_downsample(data, 100)
        assert len(result) == 100
        assert result[0]["timestamp"] == 0
        assert result[-1]["timestamp"] == 9999


# ---------------------------------------------------------------------------
# _format_bytes — pure unit test
# ---------------------------------------------------------------------------


class TestFormatBytes:
    def test_bytes(self):
        assert _format_bytes(500) == "500.0 B"

    def test_kilobytes(self):
        assert _format_bytes(2048) == "2.0 KB"

    def test_megabytes(self):
        assert _format_bytes(5 * 1024 * 1024) == "5.0 MB"

    def test_gigabytes(self):
        assert _format_bytes(3 * 1024 ** 3) == "3.0 GB"


# ---------------------------------------------------------------------------
# Daily aggregation — requires DB
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAggregateDailyReadings:
    def test_aggregates_readings_into_daily_buckets(self, sensor):
        now = timezone.now()
        SensorReading.objects.bulk_create([
            SensorReading(sensor=sensor, value=20.0, received_at=now - timedelta(hours=2)),
            SensorReading(sensor=sensor, value=30.0, received_at=now - timedelta(hours=1)),
            SensorReading(sensor=sensor, value=25.0, received_at=now),
        ])

        result = aggregate_daily_readings()
        assert result["sensors_processed"] >= 1
        assert result["buckets_created"] >= 1

        daily = SensorReadingDaily.objects.filter(sensor=sensor).first()
        assert daily is not None
        assert daily.count == 3
        assert daily.avg_value == pytest.approx(25.0, abs=0.1)
        assert daily.min_value == pytest.approx(20.0)
        assert daily.max_value == pytest.approx(30.0)

    def test_upserts_on_second_run(self, sensor):
        now = timezone.now()
        SensorReading.objects.create(sensor=sensor, value=10.0, received_at=now)

        aggregate_daily_readings()
        first_count = SensorReadingDaily.objects.filter(sensor=sensor).count()

        # Add another reading and re-aggregate
        SensorReading.objects.create(sensor=sensor, value=20.0, received_at=now - timedelta(hours=1))
        aggregate_daily_readings()

        assert SensorReadingDaily.objects.filter(sensor=sensor).count() == first_count
        daily = SensorReadingDaily.objects.filter(sensor=sensor).first()
        assert daily.count == 2


# ---------------------------------------------------------------------------
# Retention policy enforcement — requires DB
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEnforceRetentionPolicies:
    def test_deletes_old_raw_readings(self, sensor, user):
        org = sensor.zone.greenhouse.organization
        RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=7,
            hourly_retention_days=0,
        )

        now = timezone.now()
        # Old reading (should be deleted)
        SensorReading.objects.create(
            sensor=sensor, value=10.0, received_at=now - timedelta(days=10)
        )
        # Recent reading (should remain)
        SensorReading.objects.create(
            sensor=sensor, value=20.0, received_at=now
        )

        result = enforce_retention_policies()
        assert result["organizations_processed"] == 1
        assert SensorReading.objects.filter(sensor=sensor).count() == 1
        assert SensorReading.objects.filter(sensor=sensor).first().value == 20.0

    def test_skips_when_retention_is_zero(self, sensor, user):
        org = sensor.zone.greenhouse.organization
        RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=0,  # keep forever
        )

        now = timezone.now()
        SensorReading.objects.create(
            sensor=sensor, value=10.0, received_at=now - timedelta(days=365)
        )

        enforce_retention_policies()
        assert SensorReading.objects.filter(sensor=sensor).count() == 1

    def test_updates_last_cleanup_at(self, sensor, user):
        org = sensor.zone.greenhouse.organization
        policy = RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=30,
        )

        enforce_retention_policies()
        policy.refresh_from_db()
        assert policy.last_cleanup_at is not None


# ---------------------------------------------------------------------------
# Cold storage archival — requires DB + mocked boto3
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestArchiveToColdStorage:
    def test_skips_when_not_configured(self, sensor, user):
        org = sensor.zone.greenhouse.organization
        policy = RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=30,
            archive_to_cold_storage=False,
        )
        result = archive_to_cold_storage(policy)
        assert result["archived"] is False
        assert "not configured" in result["reason"].lower()

    def test_skips_when_no_bucket(self, sensor, user):
        org = sensor.zone.greenhouse.organization
        policy = RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=30,
            archive_to_cold_storage=True,
            cold_storage_bucket="",
        )
        result = archive_to_cold_storage(policy)
        assert result["archived"] is False

    def test_skips_when_no_retention_limit(self, sensor, user):
        org = sensor.zone.greenhouse.organization
        policy = RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=0,
            archive_to_cold_storage=True,
            cold_storage_bucket="my-bucket",
        )
        result = archive_to_cold_storage(policy)
        assert result["archived"] is False
        assert "no retention" in result["reason"].lower()

    @patch("apps.iot.data_pipeline.boto3")
    def test_archives_readings_to_s3(self, mock_boto3, sensor, user):
        org = sensor.zone.greenhouse.organization
        policy = RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=7,
            archive_to_cold_storage=True,
            cold_storage_bucket="test-bucket",
            cold_storage_prefix="archive/",
        )

        now = timezone.now()
        # Create old readings to archive
        for i in range(5):
            SensorReading.objects.create(
                sensor=sensor,
                value=20.0 + i,
                received_at=now - timedelta(days=10 + i),
            )

        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3

        result = archive_to_cold_storage(policy)

        assert result["archived"] is True
        assert result["records"] == 5
        assert "s3://test-bucket/" in result["storage_path"]
        mock_s3.put_object.assert_called_once()

        # Verify archive log was created
        log = DataArchiveLog.objects.filter(organization=org).last()
        assert log is not None
        assert log.status == DataArchiveLog.Status.COMPLETED
        assert log.records_archived == 5

    @patch("apps.iot.data_pipeline.boto3")
    def test_handles_s3_error(self, mock_boto3, sensor, user):
        org = sensor.zone.greenhouse.organization
        policy = RetentionPolicy.objects.create(
            organization=org,
            raw_retention_days=7,
            archive_to_cold_storage=True,
            cold_storage_bucket="test-bucket",
        )

        now = timezone.now()
        SensorReading.objects.create(
            sensor=sensor, value=20.0, received_at=now - timedelta(days=10)
        )

        mock_s3 = MagicMock()
        mock_s3.put_object.side_effect = Exception("S3 connection error")
        mock_boto3.client.return_value = mock_s3

        result = archive_to_cold_storage(policy)

        assert result["archived"] is False
        assert "S3 connection error" in result["reason"]

        log = DataArchiveLog.objects.filter(organization=org).last()
        assert log.status == DataArchiveLog.Status.FAILED


# ---------------------------------------------------------------------------
# SSE streaming endpoint — requires DB
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStreamingEndpoint:
    def test_streaming_endpoint_requires_auth(self, api_client, zone):
        """Unauthenticated request should be rejected."""
        response = api_client.get(f"/api/zones/{zone.pk}/readings/stream/")
        assert response.status_code in (401, 403)

    def test_streaming_endpoint_with_valid_token(self, auth_client, zone, sensor):
        """Authenticated request should return streaming response."""
        from rest_framework_simplejwt.tokens import RefreshToken

        user = zone.greenhouse.owner
        token = str(RefreshToken.for_user(user).access_token)

        response = auth_client.get(
            f"/api/zones/{zone.pk}/readings/stream/?token={token}",
        )
        # SSE returns a streaming response
        assert response.status_code == 200
        assert response["Content-Type"] == "text/event-stream"

    def test_streaming_endpoint_returns_sse_format(self, auth_client, zone, sensor):
        """Response should contain SSE formatted events."""
        from rest_framework_simplejwt.tokens import RefreshToken

        user = zone.greenhouse.owner
        token = str(RefreshToken.for_user(user).access_token)

        response = auth_client.get(
            f"/api/zones/{zone.pk}/readings/stream/?token={token}",
        )
        assert response.status_code == 200
        # The streaming response is an iterator. Read the first chunk.
        content = b""
        for chunk in response.streaming_content:
            content += chunk
            if b"event: connected" in content:
                break
        assert b"event: connected" in content


# ---------------------------------------------------------------------------
# Readings endpoint with max_points (LTTB via API)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReadingsMaxPoints:
    def test_max_points_param_reduces_results(self, auth_client, sensor):
        """Requesting max_points should downsample the results."""
        now = timezone.now()
        # Create 50 readings
        readings = [
            SensorReading(sensor=sensor, value=float(i), received_at=now - timedelta(minutes=i))
            for i in range(50)
        ]
        SensorReading.objects.bulk_create(readings)

        response = auth_client.get(f"/api/sensors/{sensor.pk}/readings/?max_points=10")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 10

    def test_max_points_with_aggregation(self, auth_client, sensor):
        """max_points should work together with interval=hour."""
        now = timezone.now()
        # Create readings spread across many hours
        readings = [
            SensorReading(sensor=sensor, value=float(i), received_at=now - timedelta(hours=i))
            for i in range(48)
        ]
        SensorReading.objects.bulk_create(readings)

        response = auth_client.get(
            f"/api/sensors/{sensor.pk}/readings/?interval=hour&max_points=10"
        )
        assert response.status_code == 200

    def test_max_points_validation_rejects_invalid(self, auth_client, sensor):
        """Invalid max_points should return 400."""
        response = auth_client.get(f"/api/sensors/{sensor.pk}/readings/?max_points=abc")
        assert response.status_code == 400

    def test_max_points_validation_rejects_too_small(self, auth_client, sensor):
        """max_points < 3 should return 400."""
        response = auth_client.get(f"/api/sensors/{sensor.pk}/readings/?max_points=2")
        assert response.status_code == 400
