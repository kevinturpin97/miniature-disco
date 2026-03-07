"""MQTT client for LoRa bridge.

Publishes decoded sensor data to the MQTT broker and subscribes
to command topics to relay instructions back to LoRa nodes.
Uses paho-mqtt v2 API with automatic reconnection.
"""

from __future__ import annotations

import json
import time
from typing import Callable

import paho.mqtt.client as mqtt
import structlog

from . import config

logger = structlog.get_logger(__name__)


class MqttClient:
    """Manages the MQTT connection for the LoRa bridge.

    Args:
        on_command: Callback ``(relay_id: int, payload: dict) -> None``
                    invoked when a command message is received.
    """

    def __init__(
        self,
        on_command: Callable[[int, dict], None] | None = None,
    ) -> None:
        self._on_command = on_command
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=config.MQTT_CLIENT_ID,
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._connected = False

    # ── Connection management ───────────────────────────────────

    def connect(self) -> bool:
        """Connect to the MQTT broker.

        Returns:
            True if the connection was initiated successfully.
        """
        try:
            self._client.connect(
                config.MQTT_HOST,
                config.MQTT_PORT,
                config.MQTT_KEEPALIVE,
            )
            self._client.loop_start()
            logger.info(
                "mqtt_connecting",
                host=config.MQTT_HOST,
                port=config.MQTT_PORT,
            )
            return True
        except OSError as exc:
            logger.error("mqtt_connect_failed", error=str(exc))
            return False

    def disconnect(self) -> None:
        """Disconnect from the MQTT broker."""
        self._client.loop_stop()
        self._client.disconnect()
        self._connected = False
        logger.info("mqtt_disconnected")

    @property
    def is_connected(self) -> bool:
        """Return True if connected to the broker."""
        return self._connected

    def wait_for_connection(self, timeout: float = 10.0) -> bool:
        """Block until connected or timeout.

        Args:
            timeout: Maximum seconds to wait.

        Returns:
            True if connected within timeout.
        """
        start = time.monotonic()
        while not self._connected and (time.monotonic() - start) < timeout:
            time.sleep(0.1)
        return self._connected

    # ── Publishing ──────────────────────────────────────────────

    def publish_sensor_data(self, relay_id: int, readings: list[dict]) -> bool:
        """Publish decoded sensor readings for a relay node.

        Args:
            relay_id: The relay node identifier.
            readings: List of dicts ``{"sensor_type": str, "value": float}``.

        Returns:
            True if the message was queued for delivery.
        """
        topic = config.MQTT_TOPIC_SENSORS.format(gateway_id=config.GATEWAY_ID, relay_id=relay_id)
        payload = json.dumps({"relay_id": relay_id, "readings": readings})

        result = self._client.publish(topic, payload, qos=1)
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info(
                "mqtt_published",
                topic=topic,
                relay_id=relay_id,
                reading_count=len(readings),
            )
            return True

        logger.error("mqtt_publish_failed", rc=result.rc, topic=topic)
        return False

    def publish_command_ack(
        self, relay_id: int, command_id: int, success: bool
    ) -> bool:
        """Publish a command acknowledgment from a relay node.

        Args:
            relay_id: The relay node identifier.
            command_id: The command ID being acknowledged.
            success: True if the relay executed the command successfully.

        Returns:
            True if the message was queued for delivery.
        """
        topic = config.MQTT_TOPIC_ACK.format(gateway_id=config.GATEWAY_ID, relay_id=relay_id)
        payload = json.dumps({
            "command_id": command_id,
            "status": "ACK" if success else "FAILED",
        })

        result = self._client.publish(topic, payload, qos=1)
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info(
                "mqtt_ack_published",
                topic=topic,
                relay_id=relay_id,
                command_id=command_id,
                success=success,
            )
            return True

        logger.error("mqtt_ack_publish_failed", rc=result.rc, topic=topic)
        return False

    # ── Sending commands via serial (relay back) ────────────────

    def send_command_to_serial(
        self, relay_id: int, actuator_pin: int, action: int, value: int = 0
    ) -> None:
        """Invoked when a command MQTT message arrives.

        Delegates to the on_command callback which relays
        the command to the serial writer.
        """
        if self._on_command:
            self._on_command(
                relay_id,
                {
                    "actuator_pin": actuator_pin,
                    "action": action,
                    "value": value,
                },
            )

    # ── Paho callbacks ──────────────────────────────────────────

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: mqtt.ConnectFlags,
        rc: mqtt.ReasonCode,
        properties: mqtt.Properties | None = None,
    ) -> None:
        """Called when the client connects to the broker."""
        if not rc.is_failure:
            self._connected = True
            logger.info("mqtt_connected")
            # Subscribe to command topics
            commands_topic = config.MQTT_TOPIC_COMMANDS.format(gateway_id=config.GATEWAY_ID)
            client.subscribe(commands_topic, qos=1)
            logger.info("mqtt_subscribed", topic=commands_topic)
        else:
            logger.error("mqtt_connect_refused", rc=str(rc))

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: mqtt.DisconnectFlags,
        rc: mqtt.ReasonCode,
        properties: mqtt.Properties | None = None,
    ) -> None:
        """Called when the client disconnects from the broker."""
        self._connected = False
        if rc.is_failure:
            logger.warning("mqtt_unexpected_disconnect", rc=str(rc))

    def _on_message(
        self,
        client: mqtt.Client,
        userdata: object,
        msg: mqtt.MQTTMessage,
    ) -> None:
        """Called when a command message is received.

        Expected payload JSON::

            {
                "actuator_pin": 5,
                "action": 1,
                "value": 0
            }

        Topic format: ``greenhouse/commands/{relay_id}``
        """
        try:
            # Extract relay_id from topic: greenhouse/commands/{relay_id}
            parts = msg.topic.split("/")
            relay_id = int(parts[-1])
            payload = json.loads(msg.payload.decode())

            logger.info(
                "mqtt_command_received",
                relay_id=relay_id,
                payload=payload,
            )

            self.send_command_to_serial(
                relay_id=relay_id,
                actuator_pin=payload["actuator_pin"],
                action=payload["action"],
                value=payload.get("value", 0),
            )
        except (IndexError, ValueError, KeyError, json.JSONDecodeError) as exc:
            logger.error("mqtt_command_parse_error", error=str(exc), topic=msg.topic)
