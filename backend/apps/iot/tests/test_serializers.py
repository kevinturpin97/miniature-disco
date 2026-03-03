"""Tests for IoT serializers: validation, computed fields, ownership injection."""

from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from django.utils import timezone

from apps.iot.models import Sensor
from apps.iot.serializers import (
    GreenhouseSerializer,
    SensorReadingSerializer,
    ZoneSerializer,
)
from conftest import GreenhouseFactory, SensorReadingFactory, ZoneFactory


def _make_request(user):
    """Build a minimal mock request object carrying a user."""
    request = MagicMock()
    request.user = user
    return request


@pytest.mark.django_db
class TestGreenhouseSerializer:
    """GreenhouseSerializer — owner injection, validation."""

    def test_create_injects_owner(self, user):
        request = _make_request(user)
        data = {"name": "My Greenhouse", "location": "Paris"}
        serializer = GreenhouseSerializer(data=data, context={"request": request})
        assert serializer.is_valid(), serializer.errors
        greenhouse = serializer.save()
        assert greenhouse.owner == user

    def test_zone_count_field(self, user, greenhouse, zone):
        request = _make_request(user)
        serializer = GreenhouseSerializer(greenhouse, context={"request": request})
        assert serializer.data["zone_count"] == 1

    def test_name_required(self, user):
        request = _make_request(user)
        serializer = GreenhouseSerializer(data={}, context={"request": request})
        assert not serializer.is_valid()
        assert "name" in serializer.errors


@pytest.mark.django_db
class TestZoneSerializer:
    """ZoneSerializer — is_online computed field."""

    def test_is_online_true_when_recently_seen(self, greenhouse):
        zone = ZoneFactory(
            greenhouse=greenhouse,
            transmission_interval=300,
            last_seen=timezone.now() - timedelta(seconds=100),
        )
        serializer = ZoneSerializer(zone)
        assert serializer.data["is_online"] is True

    def test_is_online_false_when_stale(self, greenhouse):
        zone = ZoneFactory(
            greenhouse=greenhouse,
            transmission_interval=300,
            last_seen=timezone.now() - timedelta(seconds=700),
        )
        serializer = ZoneSerializer(zone)
        assert serializer.data["is_online"] is False

    def test_is_online_false_when_never_seen(self, greenhouse):
        zone = ZoneFactory(greenhouse=greenhouse, last_seen=None)
        serializer = ZoneSerializer(zone)
        assert serializer.data["is_online"] is False


@pytest.mark.django_db
class TestSensorReadingSerializer:
    """SensorReadingSerializer — all fields read-only."""

    def test_serializes_value(self, sensor):
        reading = SensorReadingFactory(sensor=sensor, value=24.0)
        serializer = SensorReadingSerializer(reading)
        assert serializer.data["value"] == 24.0
        assert "received_at" in serializer.data
