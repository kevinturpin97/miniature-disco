"""Tests for IoT Celery tasks."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.iot.models import Alert
from apps.iot.tasks import detect_offline_relays
from conftest import GreenhouseFactory, ZoneFactory


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
