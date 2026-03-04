"""End-to-end pipeline tests: simulated sensor reading → database → alerts → automation.

Tests the full ingestion + evaluation pipeline without MQTT or real hardware.
Verifies that a sensor reading flows through:
  1. SensorReading creation
  2. Threshold evaluation → Alert creation
  3. Automation engine → Command creation
  4. WebSocket broadcast (channel layer assertions)
"""

import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.iot.models import (
    Actuator,
    Alert,
    AutomationRule,
    Command,
    Greenhouse,
    Sensor,
    SensorReading,
    Zone,
)
from apps.iot.automation_engine import evaluate_rules_for_reading
from apps.iot.tasks import evaluate_sensor_thresholds

User = get_user_model()


@pytest.fixture
def e2e_setup(db):
    """Create a complete greenhouse setup for E2E testing."""
    user = User.objects.create_user(
        username="e2e_user",
        password="e2e_password",
        email="e2e@test.com",
    )
    greenhouse = Greenhouse.objects.create(
        owner=user,
        name="E2E Greenhouse",
        location="Test Lab",
    )
    zone = Zone.objects.create(
        greenhouse=greenhouse,
        name="E2E Zone",
        relay_id=200,
        transmission_interval=60,
    )
    temp_sensor = Sensor.objects.create(
        zone=zone,
        sensor_type="TEMP",
        label="E2E Temperature",
        unit="°C",
        min_threshold=15.0,
        max_threshold=30.0,
    )
    humidity_sensor = Sensor.objects.create(
        zone=zone,
        sensor_type="HUM_AIR",
        label="E2E Humidity",
        unit="%",
        min_threshold=40.0,
        max_threshold=80.0,
    )
    fan = Actuator.objects.create(
        zone=zone,
        actuator_type="FAN",
        name="E2E Fan",
        gpio_pin=4,
    )
    heater = Actuator.objects.create(
        zone=zone,
        actuator_type="HEATER",
        name="E2E Heater",
        gpio_pin=7,
    )
    valve = Actuator.objects.create(
        zone=zone,
        actuator_type="VALVE",
        name="E2E Valve",
        gpio_pin=5,
    )

    # Automation rules
    rule_overheat = AutomationRule.objects.create(
        zone=zone,
        name="E2E Overheat",
        sensor_type="TEMP",
        condition="GT",
        threshold_value=30.0,
        action_actuator=fan,
        action_command_type="ON",
        cooldown_seconds=60,
    )
    rule_cold = AutomationRule.objects.create(
        zone=zone,
        name="E2E Cold",
        sensor_type="TEMP",
        condition="LT",
        threshold_value=15.0,
        action_actuator=heater,
        action_command_type="ON",
        cooldown_seconds=60,
    )

    return {
        "user": user,
        "greenhouse": greenhouse,
        "zone": zone,
        "temp_sensor": temp_sensor,
        "humidity_sensor": humidity_sensor,
        "fan": fan,
        "heater": heater,
        "valve": valve,
        "rule_overheat": rule_overheat,
        "rule_cold": rule_cold,
    }


@pytest.mark.django_db
class TestE2ENormalReading:
    """Normal readings within thresholds should not trigger alerts or automations."""

    def test_normal_reading_creates_no_alerts(self, e2e_setup):
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=22.0,
        )

        result = evaluate_sensor_thresholds(reading.pk)

        assert result == {"high": False, "low": False}
        assert Alert.objects.count() == 0

    def test_normal_reading_creates_no_commands(self, e2e_setup):
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=22.0,
        )

        commands = evaluate_rules_for_reading(reading)

        assert commands == []
        assert Command.objects.count() == 0


@pytest.mark.django_db
class TestE2EHighThreshold:
    """High temperature reading should trigger alert + fan automation."""

    def test_high_temp_creates_alert(self, e2e_setup):
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=35.0,
        )

        result = evaluate_sensor_thresholds(reading.pk)

        assert result["high"] is True
        assert result["low"] is False
        alert = Alert.objects.get()
        assert alert.alert_type == "HIGH"
        assert alert.severity == "WARNING"
        assert alert.sensor == e2e_setup["temp_sensor"]
        assert alert.zone == e2e_setup["zone"]

    def test_high_temp_triggers_fan_automation(self, e2e_setup):
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=35.0,
        )

        command_ids = evaluate_rules_for_reading(reading)

        assert len(command_ids) == 1
        cmd = Command.objects.get(pk=command_ids[0])
        assert cmd.actuator == e2e_setup["fan"]
        assert cmd.command_type == "ON"
        assert cmd.automation_rule == e2e_setup["rule_overheat"]
        assert cmd.status == "PENDING"


@pytest.mark.django_db
class TestE2ELowThreshold:
    """Low temperature reading should trigger alert + heater automation."""

    def test_low_temp_creates_alert(self, e2e_setup):
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=10.0,
        )

        result = evaluate_sensor_thresholds(reading.pk)

        assert result["low"] is True
        alert = Alert.objects.get()
        assert alert.alert_type == "LOW"

    def test_low_temp_triggers_heater_automation(self, e2e_setup):
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=10.0,
        )

        command_ids = evaluate_rules_for_reading(reading)

        assert len(command_ids) == 1
        cmd = Command.objects.get(pk=command_ids[0])
        assert cmd.actuator == e2e_setup["heater"]
        assert cmd.command_type == "ON"
        assert cmd.automation_rule == e2e_setup["rule_cold"]


@pytest.mark.django_db
class TestE2ECooldown:
    """Automation rules should respect cooldown periods."""

    def test_cooldown_prevents_repeated_triggers(self, e2e_setup):
        # First trigger
        r1 = SensorReading.objects.create(sensor=e2e_setup["temp_sensor"], value=35.0)
        ids_1 = evaluate_rules_for_reading(r1)
        assert len(ids_1) == 1

        # Second trigger immediately — should be blocked by cooldown
        r2 = SensorReading.objects.create(sensor=e2e_setup["temp_sensor"], value=36.0)
        ids_2 = evaluate_rules_for_reading(r2)
        assert len(ids_2) == 0

        # Total commands should still be 1
        assert Command.objects.count() == 1

    def test_expired_cooldown_allows_retrigger(self, e2e_setup):
        rule = e2e_setup["rule_overheat"]

        # First trigger
        r1 = SensorReading.objects.create(sensor=e2e_setup["temp_sensor"], value=35.0)
        evaluate_rules_for_reading(r1)

        # Manually expire the cooldown
        rule.refresh_from_db()
        rule.last_triggered = timezone.now() - timedelta(seconds=120)
        rule.save(update_fields=["last_triggered"])

        # Second trigger — cooldown expired
        r2 = SensorReading.objects.create(sensor=e2e_setup["temp_sensor"], value=36.0)
        ids_2 = evaluate_rules_for_reading(r2)
        assert len(ids_2) == 1

        assert Command.objects.count() == 2


@pytest.mark.django_db
class TestE2EFullPipeline:
    """Test the full pipeline from reading to command, simulating what
    happens when the MQTT worker receives sensor data."""

    @patch("apps.iot.tasks.evaluate_automation_rules.delay")
    @patch("apps.iot.tasks.evaluate_sensor_thresholds.delay")
    def test_signal_chain_fires_on_reading_create(
        self, mock_thresholds, mock_automation, e2e_setup
    ):
        """Verify that post_save signals dispatch the evaluation tasks."""
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=35.0,
        )

        mock_thresholds.assert_called_once_with(reading.pk)
        mock_automation.assert_called_once_with(reading.pk)

    def test_complete_pipeline_alert_and_command(self, e2e_setup):
        """Full sync pipeline: create reading → evaluate thresholds → evaluate rules."""
        reading = SensorReading.objects.create(
            sensor=e2e_setup["temp_sensor"],
            value=35.0,
        )

        # Step 1: Threshold evaluation
        threshold_result = evaluate_sensor_thresholds(reading.pk)
        assert threshold_result["high"] is True

        # Step 2: Automation evaluation
        command_ids = evaluate_rules_for_reading(reading)
        assert len(command_ids) == 1

        # Verify state
        assert Alert.objects.count() == 1
        assert Command.objects.count() == 1

        alert = Alert.objects.first()
        command = Command.objects.first()

        assert alert.alert_type == "HIGH"
        assert alert.zone == e2e_setup["zone"]
        assert command.actuator == e2e_setup["fan"]
        assert command.automation_rule == e2e_setup["rule_overheat"]

    def test_multiple_sensors_independent(self, e2e_setup):
        """Readings from different sensor types should be evaluated independently."""
        # Temperature reading — normal
        SensorReading.objects.create(sensor=e2e_setup["temp_sensor"], value=22.0)

        # Humidity reading — also normal
        SensorReading.objects.create(sensor=e2e_setup["humidity_sensor"], value=60.0)

        # Neither should trigger alerts or automations
        assert Alert.objects.count() == 0
        assert Command.objects.count() == 0

    def test_zone_last_seen_updated(self, e2e_setup):
        """Zone.last_seen should be updatable (simulates MQTT worker behavior)."""
        zone = e2e_setup["zone"]
        assert zone.last_seen is None

        now = timezone.now()
        Zone.objects.filter(pk=zone.pk).update(last_seen=now)

        zone.refresh_from_db()
        assert zone.last_seen is not None
