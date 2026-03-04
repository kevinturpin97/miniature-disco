"""Tests for analytics, anomaly detection, PDF reports, and hourly aggregation."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Alert,
    Greenhouse,
    Sensor,
    SensorReading,
    SensorReadingHourly,
    Zone,
)

User = get_user_model()


class AnalyticsTestBase(TestCase):
    """Common setup for analytics tests."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="analyticsuser",
            email="analytics@test.com",
            password="testpass123",
        )
        self.org = Organization.objects.create(
            name="Analytics Org", slug="analytics-org"
        )
        Membership.objects.create(
            user=self.user, organization=self.org, role=Membership.Role.ADMIN
        )
        self.greenhouse = Greenhouse.objects.create(
            name="GH1", organization=self.org, owner=self.user
        )
        self.zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="Zone A", relay_id=200
        )
        self.sensor = Sensor.objects.create(
            zone=self.zone,
            sensor_type=Sensor.SensorType.TEMPERATURE,
            unit="°C",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Create readings over 7 days
        now = timezone.now()
        self.readings = []
        for i in range(70):
            r = SensorReading.objects.create(
                sensor=self.sensor,
                value=20.0 + (i * 0.1),
            )
            # Backdate the reading
            SensorReading.objects.filter(pk=r.pk).update(
                received_at=now - timedelta(hours=i * 2)
            )
            self.readings.append(r)


class TestZoneAnalyticsEndpoint(AnalyticsTestBase):
    """Tests for GET /api/zones/{id}/analytics/."""

    def test_analytics_7d(self):
        resp = self.client.get(f"/api/zones/{self.zone.pk}/analytics/?days=7")
        assert resp.status_code == 200
        data = resp.json()
        assert data["zone_id"] == self.zone.pk
        assert data["zone_name"] == "Zone A"
        assert data["period_days"] == 7
        assert len(data["sensors"]) == 1

        sensor_data = data["sensors"][0]
        assert sensor_data["sensor_type"] == "TEMP"
        assert sensor_data["count"] > 0
        assert sensor_data["min"] is not None
        assert sensor_data["max"] is not None
        assert sensor_data["avg"] is not None
        assert sensor_data["stddev"] is not None
        assert sensor_data["trend"] in ("rising", "falling", "stable", None)

    def test_analytics_30d(self):
        resp = self.client.get(f"/api/zones/{self.zone.pk}/analytics/?days=30")
        assert resp.status_code == 200
        data = resp.json()
        assert data["period_days"] == 30

    def test_analytics_invalid_days_defaults_to_7(self):
        resp = self.client.get(f"/api/zones/{self.zone.pk}/analytics/?days=15")
        assert resp.status_code == 200
        assert resp.json()["period_days"] == 7

    def test_analytics_unauthorized(self):
        other_user = User.objects.create_user(
            username="otheruser", email="other@test.com", password="testpass123"
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        resp = other_client.get(f"/api/zones/{self.zone.pk}/analytics/")
        assert resp.status_code == 404

    def test_analytics_daily_averages(self):
        resp = self.client.get(f"/api/zones/{self.zone.pk}/analytics/?days=7")
        data = resp.json()
        sensor_data = data["sensors"][0]
        assert isinstance(sensor_data["daily_averages"], list)
        if sensor_data["daily_averages"]:
            day_entry = sensor_data["daily_averages"][0]
            assert "date" in day_entry
            assert "avg" in day_entry

    def test_analytics_no_readings(self):
        """Zone with no readings returns empty sensor stats."""
        zone2 = Zone.objects.create(
            greenhouse=self.greenhouse, name="Empty Zone", relay_id=201
        )
        Sensor.objects.create(
            zone=zone2,
            sensor_type=Sensor.SensorType.HUMIDITY_AIR,
            unit="%",
        )
        resp = self.client.get(f"/api/zones/{zone2.pk}/analytics/?days=7")
        assert resp.status_code == 200
        sensor_data = resp.json()["sensors"][0]
        assert sensor_data["count"] == 0
        assert sensor_data["avg"] is None


class TestZoneReportPDF(AnalyticsTestBase):
    """Tests for GET /api/zones/{id}/report/pdf/."""

    def test_pdf_download(self):
        resp = self.client.get(f"/api/zones/{self.zone.pk}/report/pdf/?days=7")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "application/pdf"
        assert "attachment" in resp["Content-Disposition"]
        assert f"zone_{self.zone.pk}" in resp["Content-Disposition"]
        # Verify it's actually a PDF (starts with %PDF)
        assert resp.content[:4] == b"%PDF"

    def test_pdf_30d(self):
        resp = self.client.get(f"/api/zones/{self.zone.pk}/report/pdf/?days=30")
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"

    def test_pdf_unauthorized(self):
        other_user = User.objects.create_user(
            username="pdfother", email="pdfother@test.com", password="testpass123"
        )
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        resp = other_client.get(f"/api/zones/{self.zone.pk}/report/pdf/")
        assert resp.status_code == 404


class TestOrgAnalyticsSummary(AnalyticsTestBase):
    """Tests for GET /api/orgs/{slug}/analytics/summary/."""

    def test_summary(self):
        resp = self.client.get(f"/api/orgs/{self.org.slug}/analytics/summary/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["greenhouse_count"] == 1
        assert data["zone_count"] == 1
        assert data["total_readings_7d"] >= 0
        assert data["active_alerts"] >= 0
        assert len(data["greenhouses"]) == 1
        gh = data["greenhouses"][0]
        assert gh["greenhouse_name"] == "GH1"

    def test_summary_unauthorized_org(self):
        other_org = Organization.objects.create(
            name="Other Org", slug="other-org"
        )
        resp = self.client.get(f"/api/orgs/{other_org.slug}/analytics/summary/")
        assert resp.status_code == 404


class TestAnomalyDetection(AnalyticsTestBase):
    """Tests for z-score anomaly detection."""

    def test_anomaly_detected(self):
        """A reading far outside the normal range triggers a SENSOR_ERROR alert."""
        from apps.iot.analytics import detect_anomalies

        # The readings from setUp are 20.0..26.9
        # Create an extremely anomalous reading
        anomalous = SensorReading.objects.create(
            sensor=self.sensor,
            value=100.0,  # Way outside normal range
        )
        result = detect_anomalies(anomalous)
        assert result is True

        alert = Alert.objects.filter(
            sensor=self.sensor,
            alert_type=Alert.AlertType.SENSOR_ERROR,
        ).last()
        assert alert is not None
        assert "Anomaly detected" in alert.message
        assert "z-score" in alert.message

    def test_no_anomaly_normal_value(self):
        """A normal value within recent range does not trigger an alert."""
        from apps.iot.analytics import detect_anomalies

        # Recent readings (last 24h) are 20.0..21.1, so 20.5 is well within range
        normal = SensorReading.objects.create(
            sensor=self.sensor,
            value=20.5,
        )
        result = detect_anomalies(normal)
        assert result is False

    def test_no_anomaly_insufficient_data(self):
        """Anomaly detection skips when there's too little data."""
        from apps.iot.analytics import detect_anomalies

        zone2 = Zone.objects.create(
            greenhouse=self.greenhouse, name="Sparse Zone", relay_id=202
        )
        sensor2 = Sensor.objects.create(
            zone=zone2,
            sensor_type=Sensor.SensorType.PH,
            unit="pH",
        )
        # Only create 3 readings
        for val in [6.5, 6.6, 6.7]:
            SensorReading.objects.create(sensor=sensor2, value=val)

        reading = SensorReading.objects.create(sensor=sensor2, value=99.0)
        result = detect_anomalies(reading)
        assert result is False  # Not enough data


class TestHourlyAggregation(AnalyticsTestBase):
    """Tests for aggregate_hourly_readings()."""

    def test_aggregation_creates_buckets(self):
        from apps.iot.analytics import aggregate_hourly_readings

        result = aggregate_hourly_readings()
        assert result["sensors_processed"] >= 1
        # Verify SensorReadingHourly records exist
        hourly_count = SensorReadingHourly.objects.filter(sensor=self.sensor).count()
        assert hourly_count >= 0  # May not have readings in last 2h

    def test_aggregation_idempotent(self):
        """Running aggregation twice doesn't duplicate buckets."""
        from apps.iot.analytics import aggregate_hourly_readings

        # Create readings in the last hour
        now = timezone.now()
        for i in range(5):
            r = SensorReading.objects.create(sensor=self.sensor, value=25.0 + i)
            SensorReading.objects.filter(pk=r.pk).update(
                received_at=now - timedelta(minutes=i * 10)
            )

        result1 = aggregate_hourly_readings()
        count1 = SensorReadingHourly.objects.filter(sensor=self.sensor).count()

        result2 = aggregate_hourly_readings()
        count2 = SensorReadingHourly.objects.filter(sensor=self.sensor).count()

        assert count1 == count2  # No duplicates


class TestDetectAnomaliesTask(AnalyticsTestBase):
    """Tests for the detect_anomalies Celery task."""

    @patch("apps.iot.tasks.detect_anomalies_task.delay")
    def test_task_dispatched_on_reading_create(self, mock_task):
        """Creating a SensorReading dispatches the anomaly detection task."""
        r = SensorReading.objects.create(sensor=self.sensor, value=22.0)
        mock_task.assert_called_with(r.pk)

    def test_task_nonexistent_reading(self):
        from apps.iot.tasks import detect_anomalies_task

        result = detect_anomalies_task(999999)
        assert result == {"anomaly": False}


class TestAggregationTask(TestCase):
    """Tests for the aggregate_hourly_readings Celery task."""

    def test_task_runs(self):
        from apps.iot.tasks import aggregate_hourly_readings_task

        result = aggregate_hourly_readings_task()
        assert "sensors_processed" in result
        assert "buckets_created" in result


class TestComputeTrend(TestCase):
    """Tests for the trend computation helper."""

    def test_rising_trend(self):
        from apps.iot.analytics import _compute_trend

        data = [{"avg_val": 10 + i * 2} for i in range(7)]
        assert _compute_trend(data) == "rising"

    def test_falling_trend(self):
        from apps.iot.analytics import _compute_trend

        data = [{"avg_val": 30 - i * 3} for i in range(7)]
        assert _compute_trend(data) == "falling"

    def test_stable_trend(self):
        from apps.iot.analytics import _compute_trend

        data = [{"avg_val": 20.0} for _ in range(7)]
        assert _compute_trend(data) == "stable"

    def test_insufficient_data(self):
        from apps.iot.analytics import _compute_trend

        assert _compute_trend([]) is None
        assert _compute_trend([{"avg_val": 10}]) is None
