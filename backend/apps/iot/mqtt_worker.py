"""MQTT worker for ingesting sensor data from the LoRa bridge.

Subscribes to ``greenhouse/relay/+/sensors`` and creates
:class:`~apps.iot.models.SensorReading` records for each message.
Also updates :attr:`Zone.last_seen` on every reception.
"""

from __future__ import annotations

import json
import logging
import signal
import time
from typing import Any

import paho.mqtt.client as mqtt
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

from .models import Alert, Sensor, SensorReading, Zone

logger = logging.getLogger(__name__)

# MQTT topic patterns
TOPIC_SENSORS = "greenhouse/relay/+/sensors"


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
        """Subscribe to sensor topics on successful connection."""
        if rc == mqtt.ReasonCode(mqtt.CONNACK_ACCEPTED):
            client.subscribe(TOPIC_SENSORS, qos=1)
            logger.info("MQTT connected — subscribed to %s", TOPIC_SENSORS)
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
        if rc != mqtt.ReasonCode(mqtt.CONNACK_ACCEPTED):
            logger.warning("MQTT unexpected disconnect: %s", rc)

    def _on_message(
        self,
        client: mqtt.Client,
        userdata: object,
        msg: mqtt.MQTTMessage,
    ) -> None:
        """Process an incoming sensor data message.

        Expected topic: ``greenhouse/relay/{relay_id}/sensors``
        Expected payload::

            {
                "relay_id": 1,
                "readings": [
                    {"sensor_type": "TEMP", "value": 23.45},
                    {"sensor_type": "HUM_AIR", "value": 67.5}
                ]
            }
        """
        try:
            payload = json.loads(msg.payload.decode())
            relay_id = payload["relay_id"]
            readings = payload["readings"]
        except (json.JSONDecodeError, KeyError, UnicodeDecodeError) as exc:
            logger.error("Invalid MQTT payload on %s: %s", msg.topic, exc)
            return

        self._process_readings(relay_id, readings)

    # ── Data processing ──────────────────────────────────────────

    def _process_readings(
        self,
        relay_id: int,
        readings: list[dict],
    ) -> None:
        """Persist sensor readings and update zone last_seen.

        Args:
            relay_id: The LoRa relay node identifier.
            readings: List of dicts with ``sensor_type`` and ``value`` keys.
        """
        now = timezone.now()

        # Look up the zone by relay_id
        try:
            zone = Zone.objects.select_related("greenhouse").get(relay_id=relay_id)
        except Zone.DoesNotExist:
            logger.warning("No zone found for relay_id=%s — skipping", relay_id)
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
