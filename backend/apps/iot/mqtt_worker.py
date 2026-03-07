"""MQTT worker for ingesting sensor data from the LoRa bridge.

Subscribes to ``greenhouse/+/relay/+/sensors`` and creates
:class:`~apps.iot.models.SensorReading` records for each message.
Also updates :attr:`Zone.last_seen` on every reception.

Topic format: ``greenhouse/{gateway_id}/relay/{relay_id}/sensors``
The ``gateway_id`` is the :attr:`EdgeDevice.device_id` UUID and scopes
relay IDs per installation, enabling multi-tenant deployments where
different clients may use the same relay_id (1–255).
"""

from __future__ import annotations

import json
import logging
import signal
import uuid
import time
from typing import Any

import paho.mqtt.client as mqtt
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

from .models import Actuator, Alert, Command, Sensor, SensorReading, Zone

logger = logging.getLogger(__name__)

# MQTT topic patterns — wildcard covers any gateway_id and relay_id
TOPIC_SENSORS = "greenhouse/+/relay/+/sensors"
TOPIC_COMMAND_ACK = "greenhouse/+/relay/+/ack"


class MqttWorker:
    """Subscribes to MQTT sensor topics and persists readings to the database.

    Args:
        broker_host: MQTT broker hostname.
        broker_port: MQTT broker port.
    """

    def __init__(
        self,
        broker_host: str | None = None,
        broker_port: int | None = None,
    ) -> None:
        self._host = broker_host or settings.MQTT_BROKER_HOST
        self._port = broker_port or settings.MQTT_BROKER_PORT
        self._running = False
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="django-mqtt-worker",
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

    # ── Lifecycle ────────────────────────────────────────────────

    def start(self) -> None:
        """Connect to the broker and start the network loop (blocking)."""
        self._running = True
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        while self._running:
            try:
                logger.info("Connecting to MQTT broker %s:%s", self._host, self._port)
                self._client.connect(self._host, self._port, keepalive=60)
                self._client.loop_forever()
            except OSError as exc:
                logger.error("MQTT connection error: %s — retrying in 5s", exc)
                time.sleep(5)
            except Exception:
                logger.exception("Unexpected error in MQTT worker")
                if self._running:
                    time.sleep(5)

    def stop(self) -> None:
        """Gracefully stop the worker."""
        self._running = False
        self._client.disconnect()
        logger.info("MQTT worker stopped")

    def _handle_signal(self, signum: int, frame: Any) -> None:
        """Handle SIGINT / SIGTERM for graceful shutdown."""
        logger.info("Received signal %s, shutting down", signum)
        self.stop()

    # ── Paho callbacks ───────────────────────────────────────────

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: mqtt.ConnectFlags,
        rc: mqtt.ReasonCode,
        properties: mqtt.Properties | None = None,
    ) -> None:
        """Subscribe to sensor and ACK topics on successful connection."""
        if not rc.is_failure:
            client.subscribe(TOPIC_SENSORS, qos=1)
            client.subscribe(TOPIC_COMMAND_ACK, qos=1)
            logger.info("MQTT connected — subscribed to %s, %s", TOPIC_SENSORS, TOPIC_COMMAND_ACK)
        else:
            logger.error("MQTT connection refused: %s", rc)

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: mqtt.DisconnectFlags,
        rc: mqtt.ReasonCode,
        properties: mqtt.Properties | None = None,
    ) -> None:
        """Log unexpected disconnections."""
        if rc.is_failure:
            logger.warning("MQTT unexpected disconnect: %s", rc)

    def _on_message(
        self,
        client: mqtt.Client,
        userdata: object,
        msg: mqtt.MQTTMessage,
    ) -> None:
        """Process an incoming MQTT message (sensor data or command ACK).

        Routes to the appropriate handler based on the topic pattern.
        """
        try:
            payload = json.loads(msg.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            logger.error("Invalid MQTT payload on %s: %s", msg.topic, exc)
            return

        if "/sensors" in msg.topic:
            try:
                # Topic: greenhouse/{gateway_id}/relay/{relay_id}/sensors
                parts = msg.topic.split("/")
                gateway_id = parts[1]
                relay_id = payload["relay_id"]
                readings = payload["readings"]
            except (KeyError, IndexError) as exc:
                logger.error("Missing key/index in sensor payload on %s: %s", msg.topic, exc)
                return
            self._process_readings(gateway_id, relay_id, readings)
        elif "/ack" in msg.topic:
            try:
                # Topic: greenhouse/{gateway_id}/relay/{relay_id}/ack
                parts = msg.topic.split("/")
                relay_id = int(parts[3])
            except (IndexError, ValueError) as exc:
                logger.error("Invalid ACK topic %s: %s", msg.topic, exc)
                return
            self._process_command_ack(relay_id, payload)
        else:
            logger.warning("Unknown MQTT topic: %s", msg.topic)

    # ── Data processing ──────────────────────────────────────────

    def _process_readings(
        self,
        gateway_id: str,
        relay_id: int,
        readings: list[dict],
    ) -> None:
        """Persist sensor readings and update zone last_seen.

        Args:
            gateway_id: EdgeDevice.device_id UUID string — scopes relay_id to
                the correct tenant so different clients can reuse the same IDs.
            relay_id: The LoRa relay node identifier (1–255, local to gateway).
            readings: List of dicts with ``sensor_type`` and ``value`` keys.
        """
        # Validate UUID format before hitting the database
        try:
            uuid.UUID(str(gateway_id))
        except ValueError:
            logger.warning("Invalid gateway_id format: %s — skipping", gateway_id)
            return

        now = timezone.now()

        # Look up the zone scoped by gateway → organization → greenhouse
        try:
            zone = Zone.objects.select_related("greenhouse").get(
                relay_id=relay_id,
                greenhouse__organization__edge_devices__device_id=gateway_id,
            )
        except Zone.DoesNotExist:
            logger.warning(
                "No zone found for gateway=%s relay_id=%s — skipping",
                gateway_id,
                relay_id,
            )
            return
        except Zone.MultipleObjectsReturned:
            logger.warning(
                "Multiple zones match gateway=%s relay_id=%s — skipping (check relay_id uniqueness)",
                gateway_id,
                relay_id,
            )
            return

        # Update last_seen
        Zone.objects.filter(pk=zone.pk).update(last_seen=now)

        created_readings = []
        for entry in readings:
            sensor_type = entry.get("sensor_type")
            value = entry.get("value")

            if sensor_type is None or value is None:
                logger.warning("Incomplete reading entry: %s", entry)
                continue

            # Look up existing sensor for this zone+type
            try:
                sensor = Sensor.objects.get(zone=zone, sensor_type=sensor_type)
            except Sensor.DoesNotExist:
                logger.warning(
                    "No sensor zone=%s type=%s — skipping reading",
                    zone.pk,
                    sensor_type,
                )
                continue

            reading = SensorReading.objects.create(
                sensor=sensor,
                value=value,
            )
            created_readings.append(reading)

            # Push to WebSocket channel layer
            self._push_sensor_reading(zone, sensor, reading)

            # Check thresholds and create alerts if needed
            self._check_thresholds(sensor, value, zone)

        logger.info(
            "Processed %d readings for relay_id=%s (zone=%s)",
            len(created_readings),
            relay_id,
            zone.name,
        )

    def _check_thresholds(
        self,
        sensor: Sensor,
        value: float,
        zone: Zone,
    ) -> None:
        """Create alerts if a sensor reading breaches configured thresholds.

        Args:
            sensor: The sensor that produced the reading.
            value: The reading value.
            zone: The zone containing the sensor.
        """
        if sensor.max_threshold is not None and value > sensor.max_threshold:
            alert = Alert.objects.create(
                sensor=sensor,
                zone=zone,
                alert_type=Alert.AlertType.THRESHOLD_HIGH,
                severity=Alert.Severity.WARNING,
                value=value,
                message=(
                    f"{sensor.get_sensor_type_display()} in {zone.name} "
                    f"is {value} (above threshold {sensor.max_threshold})"
                ),
            )
            self._push_alert(alert, zone)
            logger.info(
                "Threshold HIGH alert: sensor=%s value=%s max=%s",
                sensor.pk,
                value,
                sensor.max_threshold,
            )

        if sensor.min_threshold is not None and value < sensor.min_threshold:
            alert = Alert.objects.create(
                sensor=sensor,
                zone=zone,
                alert_type=Alert.AlertType.THRESHOLD_LOW,
                severity=Alert.Severity.WARNING,
                value=value,
                message=(
                    f"{sensor.get_sensor_type_display()} in {zone.name} "
                    f"is {value} (below threshold {sensor.min_threshold})"
                ),
            )
            self._push_alert(alert, zone)
            logger.info(
                "Threshold LOW alert: sensor=%s value=%s min=%s",
                sensor.pk,
                value,
                sensor.min_threshold,
            )

    # ── Channel layer push ───────────────────────────────────────

    def _push_sensor_reading(
        self,
        zone: Zone,
        sensor: Sensor,
        reading: SensorReading,
    ) -> None:
        """Push a sensor reading to the WebSocket channel layer.

        Args:
            zone: The zone the reading belongs to.
            sensor: The sensor that produced the reading.
            reading: The persisted SensorReading instance.
        """
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        group_name = f"sensors_{zone.pk}"
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "sensor_reading",
                "sensor_type": sensor.sensor_type,
                "value": reading.value,
                "sensor_id": sensor.pk,
                "zone_id": zone.pk,
                "received_at": reading.received_at.isoformat() if reading.received_at else None,
            },
        )

    def _push_alert(self, alert: Alert, zone: Zone) -> None:
        """Push an alert notification to the WebSocket channel layer.

        Sends to ``alerts_{user_id}`` for the greenhouse owner.

        Args:
            alert: The persisted Alert instance.
            zone: The zone the alert belongs to.
        """
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        owner_id = zone.greenhouse.owner_id
        group_name = f"alerts_{owner_id}"
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "alert_notification",
                "alert_id": alert.pk,
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "zone_id": zone.pk,
                "zone_name": zone.name,
                "message": alert.message,
                "created_at": alert.created_at.isoformat() if alert.created_at else None,
            },
        )

    # ── Command ACK processing ────────────────────────────────────

    def _process_command_ack(self, relay_id: int, payload: dict) -> None:
        """Process a command acknowledgment from a relay node.

        Args:
            relay_id: The LoRa relay node identifier.
            payload: Dict with ``command_id`` and ``status`` (ACK or FAILED).
        """
        command_id = payload.get("command_id")
        ack_status = payload.get("status", "ACK")

        if command_id is None:
            logger.warning("ACK payload missing command_id: %s", payload)
            return

        try:
            command = (
                Command.objects
                .select_related("actuator__zone__greenhouse")
                .get(pk=command_id)
            )
        except Command.DoesNotExist:
            logger.warning("Command %s not found for ACK — skipping", command_id)
            return

        # Verify the command belongs to this relay
        zone = command.actuator.zone
        if zone.relay_id != relay_id:
            logger.warning(
                "ACK relay_id mismatch: expected=%s got=%s command=%s",
                zone.relay_id, relay_id, command_id,
            )
            return

        now = timezone.now()

        if ack_status == "ACK":
            command.status = Command.CommandStatus.ACKNOWLEDGED
            command.acknowledged_at = now
            command.save(update_fields=["status", "acknowledged_at"])

            # Update actuator state
            actuator = command.actuator
            if command.command_type == Command.CommandType.ON:
                actuator.state = True
            elif command.command_type == Command.CommandType.OFF:
                actuator.state = False
            elif command.command_type == Command.CommandType.SET_VALUE:
                actuator.state = True
            actuator.save(update_fields=["state"])
        else:
            command.status = Command.CommandStatus.FAILED
            command.error_message = f"Relay returned: {ack_status}"
            command.save(update_fields=["status", "error_message"])

        self._push_command_status(command, zone)
        logger.info(
            "Command ACK processed: command=%s status=%s relay=%s",
            command_id, ack_status, relay_id,
        )

    def _push_command_status(self, command: Command, zone: Zone) -> None:
        """Push a command status update to the WebSocket channel layer.

        Args:
            command: The updated Command instance.
            zone: The zone containing the actuator.
        """
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        owner_id = zone.greenhouse.owner_id
        group_name = f"commands_{owner_id}"
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "command_status_update",
                "command_id": command.pk,
                "actuator_id": command.actuator_id,
                "status": command.status,
                "sent_at": command.sent_at.isoformat() if command.sent_at else None,
                "acknowledged_at": command.acknowledged_at.isoformat() if command.acknowledged_at else None,
                "error_message": command.error_message,
            },
        )
