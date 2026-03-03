"""Tests for IoT Celery tasks."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.iot.models import Alert
from apps.iot.tasks import detect_offline_relays, evaluate_sensor_thresholds
from conftest import GreenhouseFactory, SensorFactory, SensorReadingFactory, ZoneFactory


@pytest.mark.django_db
class TestDetectOfflineRelays:
    """Tests for the detect_offline_relays periodic task."""

    def test_online_zone_no_alert(self):
        """Zone seen recently does not produce an alert."""
        gh = GreenhouseFactory()
        ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now(),
            transmission_interval=300,
        )

        result = detect_offline_relays()

        assert result["checked"] == 1
        assert result["offline"] == 0
        assert Alert.objects.count() == 0

    def test_offline_zone_creates_alert(self):
        """Zone not seen for > 2x interval creates a RELAY_OFFLINE alert."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now() - timedelta(seconds=700),
            transmission_interval=300,
        )

        result = detect_offline_relays()

        assert result["checked"] == 1
        assert result["offline"] == 1
        assert Alert.objects.count() == 1
        alert = Alert.objects.first()
        assert alert.alert_type == Alert.AlertType.RELAY_OFFLINE
        assert alert.severity == Alert.Severity.CRITICAL
        assert alert.zone == zone

    def test_never_seen_zone_skipped(self):
        """Zone with last_seen=None is skipped (not yet commissioned)."""
        gh = GreenhouseFactory()
        ZoneFactory(greenhouse=gh, last_seen=None, transmission_interval=300)

        result = detect_offline_relays()

        assert result["checked"] == 1
        assert result["offline"] == 0
        assert Alert.objects.count() == 0

    def test_inactive_zone_not_checked(self):
        """Inactive zones are excluded from checks."""
        gh = GreenhouseFactory()
        ZoneFactory(
            greenhouse=gh,
            is_active=False,
            last_seen=timezone.now() - timedelta(seconds=9999),
            transmission_interval=300,
        )

        result = detect_offline_relays()

        assert result["checked"] == 0
        assert result["offline"] == 0

    def test_duplicate_alert_not_created(self):
        """No duplicate offline alert when one is already unacknowledged."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now() - timedelta(seconds=700),
            transmission_interval=300,
        )
        Alert.objects.create(
            zone=zone,
            alert_type=Alert.AlertType.RELAY_OFFLINE,
            severity=Alert.Severity.CRITICAL,
            message="Already offline",
        )

        result = detect_offline_relays()

        assert result["offline"] == 0
        assert Alert.objects.count() == 1  # No new alert

    def test_acknowledged_alert_allows_new_one(self):
        """Acknowledged offline alert allows a new alert to be created."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now() - timedelta(seconds=700),
            transmission_interval=300,
        )
        Alert.objects.create(
            zone=zone,
            alert_type=Alert.AlertType.RELAY_OFFLINE,
            severity=Alert.Severity.CRITICAL,
            message="Old offline alert",
            is_acknowledged=True,
        )

        result = detect_offline_relays()

        assert result["offline"] == 1
        assert Alert.objects.count() == 2  # Old + new

    def test_multiple_zones(self):
        """Multiple zones are checked independently."""
        gh = GreenhouseFactory()
        ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now(),
            transmission_interval=300,
        )
        ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now() - timedelta(seconds=700),
            transmission_interval=300,
        )
        ZoneFactory(
            greenhouse=gh,
            last_seen=timezone.now() - timedelta(seconds=1000),
            transmission_interval=300,
        )

        result = detect_offline_relays()

        assert result["checked"] == 3
        assert result["offline"] == 2
        assert Alert.objects.count() == 2


@pytest.mark.django_db
class TestEvaluateSensorThresholds:
    """Tests for the evaluate_sensor_thresholds Celery task."""

    def test_no_alert_when_within_range(self):
        """No alert when reading is within thresholds."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, min_threshold=10.0, max_threshold=30.0)
        reading = SensorReadingFactory(sensor=sensor, value=22.0)

        result = evaluate_sensor_thresholds(reading.pk)

        assert result == {"high": False, "low": False}
        assert Alert.objects.count() == 0

    def test_high_threshold_alert(self):
        """Alert created when value exceeds max_threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, max_threshold=30.0)
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_sensor_thresholds(reading.pk)

        assert result["high"] is True
        assert result["low"] is False
        assert Alert.objects.count() == 1
        alert = Alert.objects.first()
        assert alert.alert_type == Alert.AlertType.THRESHOLD_HIGH
        assert alert.severity == Alert.Severity.WARNING
        assert alert.sensor == sensor
        assert alert.zone == zone
        assert alert.value == 35.0

    def test_low_threshold_alert(self):
        """Alert created when value falls below min_threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, min_threshold=10.0)
        reading = SensorReadingFactory(sensor=sensor, value=5.0)

        result = evaluate_sensor_thresholds(reading.pk)

        assert result["high"] is False
        assert result["low"] is True
        assert Alert.objects.count() == 1
        alert = Alert.objects.first()
        assert alert.alert_type == Alert.AlertType.THRESHOLD_LOW
        assert alert.value == 5.0

    def test_both_thresholds_can_trigger(self):
        """Both high and low alerts created for a value below min when max is set too."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, min_threshold=10.0, max_threshold=5.0)
        reading = SensorReadingFactory(sensor=sensor, value=7.0)

        result = evaluate_sensor_thresholds(reading.pk)

        # value=7 is above max_threshold=5 and below min_threshold=10
        assert result["high"] is True
        assert result["low"] is True
        assert Alert.objects.count() == 2

    def test_no_threshold_configured(self):
        """No alert when sensor has no thresholds set."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, min_threshold=None, max_threshold=None)
        reading = SensorReadingFactory(sensor=sensor, value=999.0)

        result = evaluate_sensor_thresholds(reading.pk)

        assert result == {"high": False, "low": False}
        assert Alert.objects.count() == 0

    def test_nonexistent_reading(self):
        """Gracefully handles a missing SensorReading."""
        result = evaluate_sensor_thresholds(999999)

        assert result == {"high": False, "low": False}
        assert Alert.objects.count() == 0

    def test_exact_threshold_no_alert(self):
        """Value exactly at threshold does not trigger alert."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, min_threshold=10.0, max_threshold=30.0)
        reading = SensorReadingFactory(sensor=sensor, value=30.0)

        result = evaluate_sensor_thresholds(reading.pk)

        assert result == {"high": False, "low": False}
        assert Alert.objects.count() == 0
