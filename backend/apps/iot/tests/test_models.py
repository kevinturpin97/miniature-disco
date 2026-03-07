"""Tests for IoT models: validators, constraints, and string representations."""

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.iot.models import Actuator, AutomationRule, Command, Sensor, Zone
from conftest import (
    ActuatorFactory,
    AutomationRuleFactory,
    GreenhouseFactory,
    SensorFactory,
    SensorReadingFactory,
    ZoneFactory,
)


@pytest.mark.django_db
class TestZoneModel:
    """Zone model — relay_id validators and __str__."""

    def test_relay_id_min_valid(self, greenhouse):
        zone = ZoneFactory(greenhouse=greenhouse, relay_id=1)
        zone.full_clean()  # should not raise

    def test_relay_id_max_valid(self, greenhouse):
        zone = ZoneFactory(greenhouse=greenhouse, relay_id=255)
        zone.full_clean()

    def test_relay_id_zero_invalid(self, greenhouse):
        zone = ZoneFactory.build(greenhouse=greenhouse, relay_id=0)
        with pytest.raises(ValidationError):
            zone.full_clean()

    def test_relay_id_over_max_invalid(self, greenhouse):
        zone = ZoneFactory.build(greenhouse=greenhouse, relay_id=256)
        with pytest.raises(ValidationError):
            zone.full_clean()

    def test_relay_id_unique_within_greenhouse(self, greenhouse):
        """Same relay_id in the same greenhouse raises IntegrityError."""
        ZoneFactory(greenhouse=greenhouse, relay_id=10)
        with pytest.raises(IntegrityError):
            ZoneFactory(greenhouse=greenhouse, relay_id=10)

    def test_relay_id_shared_across_greenhouses(self, db):
        """Same relay_id in different greenhouses is allowed (local LoRa address space)."""
        gh1 = GreenhouseFactory()
        gh2 = GreenhouseFactory()
        ZoneFactory(greenhouse=gh1, relay_id=1)
        zone2 = ZoneFactory(greenhouse=gh2, relay_id=1)  # must not raise
        assert zone2.pk is not None

    def test_str_representation(self, zone):
        expected = f"{zone.greenhouse.name} - {zone.name}"
        assert str(zone) == expected


@pytest.mark.django_db
class TestSensorModel:
    """Sensor model — unique_together and __str__."""

    def test_unique_together_zone_sensor_type(self, zone):
        SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE)
        with pytest.raises(IntegrityError):
            SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE)

    def test_different_types_allowed_same_zone(self, zone):
        s1 = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE)
        s2 = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.PH)
        assert s1.pk != s2.pk

    def test_same_type_different_zones_allowed(self, zone, greenhouse):
        zone2 = ZoneFactory(greenhouse=greenhouse)
        s1 = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.CO2)
        s2 = SensorFactory(zone=zone2, sensor_type=Sensor.SensorType.CO2)
        assert s1.pk != s2.pk

    def test_str_representation(self, sensor):
        assert sensor.zone.name in str(sensor)


@pytest.mark.django_db
class TestGreenhouseModel:
    """Greenhouse __str__."""

    def test_str_returns_name(self, greenhouse):
        assert str(greenhouse) == greenhouse.name


@pytest.mark.django_db
class TestActuatorModel:
    """Actuator __str__."""

    def test_str_off_state(self, actuator):
        actuator.state = False
        assert "OFF" in str(actuator)

    def test_str_on_state(self, actuator):
        actuator.state = True
        actuator.save()
        assert "ON" in str(actuator)


@pytest.mark.django_db
class TestCommandModel:
    """Command __str__."""

    def test_str_representation(self, actuator):
        cmd = Command.objects.create(
            actuator=actuator,
            command_type=Command.CommandType.ON,
            status=Command.CommandStatus.PENDING,
        )
        assert "ON" in str(cmd)
        assert actuator.name in str(cmd)


@pytest.mark.django_db
class TestSensorReadingModel:
    """SensorReading __str__."""

    def test_str_contains_value(self, sensor):
        reading = SensorReadingFactory(sensor=sensor, value=23.5)
        assert "23.5" in str(reading)


@pytest.mark.django_db
class TestAutomationRuleModel:
    """AutomationRule __str__."""

    def test_str_contains_name(self, zone, actuator):
        rule = AutomationRuleFactory(
            zone=zone,
            action_actuator=actuator,
        )
        assert rule.name in str(rule)
