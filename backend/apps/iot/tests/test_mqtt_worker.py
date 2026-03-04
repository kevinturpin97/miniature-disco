"""Tests for the MQTT ingestion worker."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from apps.iot.models import Actuator, Alert, Command, Sensor, SensorReading, Zone
from apps.iot.mqtt_worker import MqttWorker
from conftest import (
    ActuatorFactory,
    CommandFactory,
    GreenhouseFactory,
    SensorFactory,
    ZoneFactory,
)


@pytest.fixture
def worker() -> MqttWorker:
    """Return an MqttWorker with a mocked MQTT client."""
    with patch("apps.iot.mqtt_worker.mqtt.Client"):
        w = MqttWorker(broker_host="localhost", broker_port=1883)
    return w


@pytest.fixture
def zone_with_sensors(db) -> tuple[Zone, dict[str, Sensor]]:
    """Create a zone with TEMP and HUM_AIR sensors."""
    greenhouse = GreenhouseFactory()
    zone = ZoneFactory(greenhouse=greenhouse, relay_id=42)
    temp_sensor = SensorFactory(
        zone=zone,
        sensor_type=Sensor.SensorType.TEMPERATURE,
        unit="°C",
    )
    hum_sensor = SensorFactory(
        zone=zone,
        sensor_type=Sensor.SensorType.HUMIDITY_AIR,
        unit="%",
    )
    return zone, {"TEMP": temp_sensor, "HUM_AIR": hum_sensor}


# ── _process_readings tests ──────────────────────────────────────


@pytest.mark.django_db
class TestProcessReadings:
    """Tests for MqttWorker._process_readings."""

    def test_creates_sensor_readings(self, worker, zone_with_sensors):
        """Valid readings create SensorReading records."""
        zone, sensors = zone_with_sensors
        readings = [
            {"sensor_type": "TEMP", "value": 23.45},
            {"sensor_type": "HUM_AIR", "value": 67.5},
        ]

        worker._process_readings(relay_id=42, readings=readings)

        assert SensorReading.objects.count() == 2
        temp_reading = SensorReading.objects.get(sensor=sensors["TEMP"])
        assert temp_reading.value == 23.45
        hum_reading = SensorReading.objects.get(sensor=sensors["HUM_AIR"])
        assert hum_reading.value == 67.5

    def test_updates_zone_last_seen(self, worker, zone_with_sensors):
        """Processing readings updates Zone.last_seen."""
        zone, _ = zone_with_sensors
        assert zone.last_seen is None

        worker._process_readings(relay_id=42, readings=[{"sensor_type": "TEMP", "value": 20.0}])

        zone.refresh_from_db()
        assert zone.last_seen is not None

    def test_unknown_relay_id_skipped(self, worker, db):
        """Unknown relay_id produces no readings."""
        worker._process_readings(relay_id=999, readings=[{"sensor_type": "TEMP", "value": 20.0}])
        assert SensorReading.objects.count() == 0

    def test_unknown_sensor_type_skipped(self, worker, zone_with_sensors):
        """Unknown sensor_type is skipped without error."""
        zone, _ = zone_with_sensors
        worker._process_readings(relay_id=42, readings=[{"sensor_type": "CO2", "value": 400.0}])
        assert SensorReading.objects.count() == 0

    def test_incomplete_reading_entry_skipped(self, worker, zone_with_sensors):
        """Entries missing sensor_type or value are skipped."""
        zone, _ = zone_with_sensors
        readings = [
            {"sensor_type": "TEMP"},  # missing value
            {"value": 23.0},  # missing sensor_type
            {},  # both missing
        ]
        worker._process_readings(relay_id=42, readings=readings)
        assert SensorReading.objects.count() == 0


# ── Threshold alert tests ────────────────────────────────────────


@pytest.mark.django_db
class TestThresholdAlerts:
    """Tests for threshold breach detection in _check_thresholds."""

    def test_high_threshold_alert(self, worker, zone_with_sensors):
        """Value above max_threshold creates a HIGH alert."""
        zone, sensors = zone_with_sensors
        sensors["TEMP"].max_threshold = 30.0
        sensors["TEMP"].save()

        worker._process_readings(relay_id=42, readings=[{"sensor_type": "TEMP", "value": 35.0}])

        assert Alert.objects.count() == 1
        alert = Alert.objects.first()
        assert alert.alert_type == Alert.AlertType.THRESHOLD_HIGH
        assert alert.severity == Alert.Severity.WARNING
        assert alert.value == 35.0
        assert alert.sensor == sensors["TEMP"]

    def test_low_threshold_alert(self, worker, zone_with_sensors):
        """Value below min_threshold creates a LOW alert."""
        zone, sensors = zone_with_sensors
        sensors["TEMP"].min_threshold = 10.0
        sensors["TEMP"].save()

        worker._process_readings(relay_id=42, readings=[{"sensor_type": "TEMP", "value": 5.0}])

        assert Alert.objects.count() == 1
        alert = Alert.objects.first()
        assert alert.alert_type == Alert.AlertType.THRESHOLD_LOW
        assert alert.value == 5.0

    def test_no_alert_within_thresholds(self, worker, zone_with_sensors):
        """Value within thresholds creates no alert."""
        zone, sensors = zone_with_sensors
        sensors["TEMP"].min_threshold = 10.0
        sensors["TEMP"].max_threshold = 30.0
        sensors["TEMP"].save()

        worker._process_readings(relay_id=42, readings=[{"sensor_type": "TEMP", "value": 20.0}])

        assert Alert.objects.count() == 0

    def test_no_thresholds_no_alert(self, worker, zone_with_sensors):
        """No thresholds configured means no alerts."""
        worker._process_readings(relay_id=42, readings=[{"sensor_type": "TEMP", "value": 99.0}])
        assert Alert.objects.count() == 0


# ── _on_message tests ────────────────────────────────────────────


@pytest.mark.django_db
class TestOnMessage:
    """Tests for MqttWorker._on_message callback."""

    def test_valid_json_payload(self, worker, zone_with_sensors):
        """Valid JSON payload triggers _process_readings."""
        zone, _ = zone_with_sensors
        msg = MagicMock()
        msg.topic = "greenhouse/relay/42/sensors"
        msg.payload = json.dumps({
            "relay_id": 42,
            "readings": [{"sensor_type": "TEMP", "value": 22.0}],
        }).encode()

        worker._on_message(client=MagicMock(), userdata=None, msg=msg)

        assert SensorReading.objects.count() == 1

    def test_invalid_json_payload(self, worker, db):
        """Invalid JSON does not crash the worker."""
        msg = MagicMock()
        msg.topic = "greenhouse/relay/1/sensors"
        msg.payload = b"not json"

        worker._on_message(client=MagicMock(), userdata=None, msg=msg)

        assert SensorReading.objects.count() == 0

    def test_missing_key_payload(self, worker, db):
        """Payload missing 'readings' key is handled gracefully."""
        msg = MagicMock()
        msg.topic = "greenhouse/relay/1/sensors"
        msg.payload = json.dumps({"relay_id": 1}).encode()

        worker._on_message(client=MagicMock(), userdata=None, msg=msg)

        assert SensorReading.objects.count() == 0


# ── _process_command_ack tests ──────────────────────────────────


@pytest.mark.django_db
class TestProcessCommandAck:
    """Tests for MqttWorker._process_command_ack."""

    def test_valid_ack_updates_command_status(self, worker):
        """ACK payload updates command to ACKNOWLEDGED."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh, relay_id=42)
        actuator = ActuatorFactory(zone=zone, state=False)
        command = CommandFactory(actuator=actuator, command_type="ON", status="SENT")

        worker._process_command_ack(
            relay_id=42,
            payload={"command_id": command.pk, "status": "ACK"},
        )

        command.refresh_from_db()
        assert command.status == Command.CommandStatus.ACKNOWLEDGED
        assert command.acknowledged_at is not None
        actuator.refresh_from_db()
        assert actuator.state is True

    def test_failed_ack_updates_status(self, worker):
        """FAILED ACK marks command as FAILED with error_message."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh, relay_id=42)
        actuator = ActuatorFactory(zone=zone)
        command = CommandFactory(actuator=actuator, command_type="ON", status="SENT")

        worker._process_command_ack(
            relay_id=42,
            payload={"command_id": command.pk, "status": "FAILED"},
        )

        command.refresh_from_db()
        assert command.status == Command.CommandStatus.FAILED
        assert "FAILED" in command.error_message

    def test_invalid_command_id_skipped(self, worker, db):
        """Non-existent command ID is handled gracefully."""
        worker._process_command_ack(
            relay_id=42,
            payload={"command_id": 999999, "status": "ACK"},
        )
        # Should not raise

    def test_missing_command_id_skipped(self, worker, db):
        """Payload without command_id is skipped."""
        worker._process_command_ack(
            relay_id=42,
            payload={"status": "ACK"},
        )
        # Should not raise

    def test_relay_id_mismatch_skipped(self, worker):
        """ACK from wrong relay_id is rejected."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh, relay_id=42)
        actuator = ActuatorFactory(zone=zone)
        command = CommandFactory(actuator=actuator, command_type="ON", status="SENT")

        worker._process_command_ack(
            relay_id=99,  # Wrong relay_id
            payload={"command_id": command.pk, "status": "ACK"},
        )

        command.refresh_from_db()
        assert command.status == Command.CommandStatus.SENT  # Unchanged

    def test_off_command_ack_sets_state_false(self, worker):
        """ACK for OFF command sets actuator state to False."""
        gh = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=gh, relay_id=42)
        actuator = ActuatorFactory(zone=zone, state=True)
        command = CommandFactory(actuator=actuator, command_type="OFF", status="SENT")

        worker._process_command_ack(
            relay_id=42,
            payload={"command_id": command.pk, "status": "ACK"},
        )

        actuator.refresh_from_db()
        assert actuator.state is False
