"""Tests for the automation engine and evaluate_automation_rules task."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.iot.automation_engine import evaluate_rules_for_reading
from apps.iot.models import AutomationRule, Command, Sensor
from apps.iot.tasks import evaluate_automation_rules
from conftest import (
    ActuatorFactory,
    AutomationRuleFactory,
    GreenhouseFactory,
    SensorFactory,
    SensorReadingFactory,
    ZoneFactory,
)


# ── Condition evaluation tests ───────────────────────────────────


@pytest.mark.django_db
class TestConditionEvaluation:
    """Tests for automation rule condition matching."""

    def test_greater_than_triggers(self):
        """GT condition triggers when value > threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            action_command_type="ON",
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1
        command = Command.objects.get(pk=result[0])
        assert command.command_type == "ON"
        assert command.actuator == actuator
        assert command.automation_rule is not None

    def test_greater_than_does_not_trigger_below(self):
        """GT condition does not trigger when value <= threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=25.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 0
        assert Command.objects.count() == 0

    def test_less_than_triggers(self):
        """LT condition triggers when value < threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="LT",
            threshold_value=10.0,
            action_actuator=actuator,
            action_command_type="ON",
        )
        reading = SensorReadingFactory(sensor=sensor, value=5.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1

    def test_equal_triggers(self):
        """EQ condition triggers when value == threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.PH, unit="")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="PH",
            condition="EQ",
            threshold_value=7.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=7.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1

    def test_greater_equal_triggers(self):
        """GTE condition triggers when value >= threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GTE",
            threshold_value=30.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=30.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1

    def test_less_equal_triggers(self):
        """LTE condition triggers when value <= threshold."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.HUMIDITY_AIR, unit="%")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="HUM_AIR",
            condition="LTE",
            threshold_value=40.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=40.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1


# ── Cooldown tests ───────────────────────────────────────────────


@pytest.mark.django_db
class TestCooldown:
    """Tests for automation rule cooldown mechanism."""

    def test_cooldown_prevents_retrigger(self):
        """Rule does not fire again within cooldown period."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        rule = AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            cooldown_seconds=300,
            last_triggered=timezone.now() - timedelta(seconds=60),  # triggered 60s ago
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 0
        rule.refresh_from_db()
        # last_triggered should remain unchanged
        assert Command.objects.count() == 0

    def test_cooldown_expired_allows_retrigger(self):
        """Rule fires again after cooldown period has elapsed."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            cooldown_seconds=300,
            last_triggered=timezone.now() - timedelta(seconds=600),  # triggered 600s ago
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1

    def test_never_triggered_rule_fires(self):
        """Rule with last_triggered=None fires on first match."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            last_triggered=None,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1

    def test_last_triggered_updated_on_fire(self):
        """last_triggered is updated when rule fires."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        rule = AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            last_triggered=None,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        evaluate_rules_for_reading(reading)

        rule.refresh_from_db()
        assert rule.last_triggered is not None


# ── Rule filtering tests ────────────────────────────────────────


@pytest.mark.django_db
class TestRuleFiltering:
    """Tests for correct rule selection based on zone and sensor type."""

    def test_inactive_rule_not_evaluated(self):
        """Inactive rules are skipped."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            is_active=False,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 0

    def test_different_zone_rule_not_evaluated(self):
        """Rules for a different zone are not evaluated."""
        gh = GreenhouseFactory()
        zone1 = ZoneFactory(greenhouse=gh)
        zone2 = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone1, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone2)
        AutomationRuleFactory(
            zone=zone2,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 0

    def test_different_sensor_type_not_evaluated(self):
        """Rules for a different sensor type are not evaluated."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="HUM_AIR",
            condition="GT",
            threshold_value=80.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 0

    def test_multiple_matching_rules(self):
        """Multiple matching rules each create their own command."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator1 = ActuatorFactory(zone=zone)
        actuator2 = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator1,
            action_command_type="ON",
        )
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=25.0,
            action_actuator=actuator2,
            action_command_type="OFF",
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 2
        assert Command.objects.count() == 2

    def test_set_value_command(self):
        """Rule with SET command type includes action_value."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
            action_command_type="SET",
            action_value=50.0,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_rules_for_reading(reading)

        assert len(result) == 1
        command = Command.objects.get(pk=result[0])
        assert command.command_type == "SET"
        assert command.value == 50.0


# ── Celery task wrapper tests ────────────────────────────────────


@pytest.mark.django_db
class TestEvaluateAutomationRulesTask:
    """Tests for the evaluate_automation_rules Celery task."""

    def test_task_triggers_matching_rule(self):
        """Task correctly evaluates rules and returns triggered count."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        result = evaluate_automation_rules(reading.pk)

        assert result == {"triggered": 1}
        assert Command.objects.count() == 1

    def test_task_no_matching_rules(self):
        """Task returns 0 triggered when no rules match."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        reading = SensorReadingFactory(sensor=sensor, value=20.0)

        result = evaluate_automation_rules(reading.pk)

        assert result == {"triggered": 0}

    def test_task_nonexistent_reading(self):
        """Task handles non-existent reading gracefully."""
        result = evaluate_automation_rules(999999)
        assert result == {"triggered": 0}

    def test_command_links_to_automation_rule(self):
        """Created command has automation_rule FK set."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh)
        sensor = SensorFactory(zone=zone, sensor_type=Sensor.SensorType.TEMPERATURE, unit="°C")
        actuator = ActuatorFactory(zone=zone)
        rule = AutomationRuleFactory(
            zone=zone,
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=actuator,
        )
        reading = SensorReadingFactory(sensor=sensor, value=35.0)

        evaluate_automation_rules(reading.pk)

        command = Command.objects.first()
        assert command.automation_rule == rule
        assert command.created_by is None
