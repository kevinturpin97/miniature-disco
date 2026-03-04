"""LoRa Bridge main entry point.

Orchestrates the serial reader, MQTT client, and protocol codec:

    LoRa radio  ←→  Serial port  ←→  Bridge  ←→  MQTT broker
                                       ↕
                                  protocol.py
"""

from __future__ import annotations

import signal
import sys
import time

import structlog

from . import config
from .mqtt_client import MqttClient
from .protocol import (
    AckFrame,
    CommandFrame,
    decode_ack_frame,
    decode_sensor_frame,
    encode_command,
)
from .serial_reader import SerialReader

logger = structlog.get_logger(__name__)


def configure_logging() -> None:
    """Set up structlog with human-readable console output."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            structlog.get_level_from_name(config.LOG_LEVEL)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


class LoraBridge:
    """Main bridge orchestrator.

    Wires together the serial reader, MQTT client, and protocol
    encoder/decoder.
    """

    def __init__(self) -> None:
        self._mqtt = MqttClient(on_command=self._handle_mqtt_command)
        self._serial = SerialReader(on_frame=self._handle_serial_frame)
        self._running = False

    # ── Serial → MQTT (sensor data) ────────────────────────────

    def _handle_serial_frame(self, raw: bytes) -> None:
        """Decode a raw serial frame and publish sensor data or ACK via MQTT."""
        frame = decode_sensor_frame(raw)
        if frame is not None:
            readings = [
                {"sensor_type": r.sensor_type, "value": r.value}
                for r in frame.readings
            ]
            self._mqtt.publish_sensor_data(frame.relay_id, readings)
            return

        ack = decode_ack_frame(raw)
        if ack is not None:
            self._mqtt.publish_command_ack(ack.relay_id, ack.command_id, ack.success)
            return

        logger.warning("unrecognized_serial_frame", length=len(raw))

    # ── MQTT → Serial (commands) ────────────────────────────────

    def _handle_mqtt_command(self, relay_id: int, payload: dict) -> None:
        """Encode a command and send it via the serial port to the LoRa gateway."""
        cmd = CommandFrame(
            relay_id=relay_id,
            actuator_pin=payload["actuator_pin"],
            action=payload["action"],
            value=payload.get("value", 0),
        )
        encoded = encode_command(cmd)
        self._serial.write(encoded)

    # ── Lifecycle ───────────────────────────────────────────────

    def start(self) -> None:
        """Connect to MQTT and start the serial read loop."""
        self._running = True
        logger.info(
            "bridge_starting",
            serial_port=config.SERIAL_PORT,
            mqtt_host=config.MQTT_HOST,
        )

        # Connect MQTT (non-blocking — loop_start runs in a background thread)
        while self._running:
            if self._mqtt.connect():
                if self._mqtt.wait_for_connection(timeout=10.0):
                    break
            logger.warning("mqtt_retry", delay=config.MQTT_RECONNECT_DELAY)
            time.sleep(config.MQTT_RECONNECT_DELAY)

        if not self._running:
            return

        logger.info("bridge_running")

        # Blocking serial read loop (runs until stop() is called)
        self._serial.run()

    def stop(self) -> None:
        """Gracefully shut down the bridge."""
        logger.info("bridge_stopping")
        self._running = False
        self._serial.stop()
        self._mqtt.disconnect()
        self._serial.disconnect()
        logger.info("bridge_stopped")


def main() -> None:
    """Entry point for ``python -m bridge.main``."""
    configure_logging()

    bridge = LoraBridge()

    def _shutdown(sig: int, frame: object) -> None:
        logger.info("signal_received", signal=sig)
        bridge.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    bridge.start()


if __name__ == "__main__":
    main()
