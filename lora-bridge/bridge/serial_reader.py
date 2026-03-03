"""Serial reader for LoRa bridge.

Reads raw binary frames from the Raspberry Pi's serial port connected
to the LoRa concentrator.  Implements automatic reconnection on failure.

Frame boundary detection:
    The LoRa radio delivers complete packets — each ``Serial.read()`` call
    from pyserial returns a full frame as a contiguous byte sequence.
    The bridge reads size-prefixed chunks: the first byte after a sync
    window is the frame length, followed by that many payload bytes.

    For simplicity and robustness we use a fixed-size read with timeout:
    read up to MAX_FRAME bytes, then hand the buffer to the protocol
    decoder which validates via CRC.
"""

from __future__ import annotations

import time
from typing import Callable

import serial
import structlog

from . import config

logger = structlog.get_logger(__name__)

MAX_FRAME_SIZE: int = 24


class SerialReader:
    """Manages a serial connection to the LoRa gateway hardware.

    Args:
        port: Serial device path (e.g. ``/dev/ttyUSB0``).
        baud: Baud rate.
        timeout: Read timeout in seconds.
        on_frame: Callback invoked with raw bytes for each received frame.
    """

    def __init__(
        self,
        port: str = config.SERIAL_PORT,
        baud: int = config.SERIAL_BAUD,
        timeout: float = config.SERIAL_TIMEOUT,
        on_frame: Callable[[bytes], None] | None = None,
    ) -> None:
        self._port = port
        self._baud = baud
        self._timeout = timeout
        self._on_frame = on_frame
        self._serial: serial.Serial | None = None
        self._running = False

    # ── Connection management ───────────────────────────────────

    def connect(self) -> bool:
        """Open the serial port.

        Returns:
            True if the connection was established successfully.
        """
        try:
            self._serial = serial.Serial(
                port=self._port,
                baudrate=self._baud,
                timeout=self._timeout,
            )
            logger.info("serial_connected", port=self._port, baud=self._baud)
            return True
        except serial.SerialException as exc:
            logger.error("serial_connect_failed", port=self._port, error=str(exc))
            self._serial = None
            return False

    def disconnect(self) -> None:
        """Close the serial port."""
        if self._serial and self._serial.is_open:
            self._serial.close()
            logger.info("serial_disconnected", port=self._port)
        self._serial = None

    @property
    def is_connected(self) -> bool:
        """Return True if the serial port is open."""
        return self._serial is not None and self._serial.is_open

    # ── Reading loop ────────────────────────────────────────────

    def run(self) -> None:
        """Blocking read loop with automatic reconnection.

        Calls ``on_frame(raw_bytes)`` for each received frame.
        """
        self._running = True
        while self._running:
            if not self.is_connected:
                if not self.connect():
                    logger.warning(
                        "serial_reconnect_wait",
                        delay=config.SERIAL_RECONNECT_DELAY,
                    )
                    time.sleep(config.SERIAL_RECONNECT_DELAY)
                    continue

            try:
                self._read_once()
            except serial.SerialException as exc:
                logger.error("serial_read_error", error=str(exc))
                self.disconnect()
            except OSError as exc:
                logger.error("serial_os_error", error=str(exc))
                self.disconnect()

    def stop(self) -> None:
        """Signal the read loop to stop."""
        self._running = False

    def _read_once(self) -> None:
        """Read a single frame from the serial port.

        Waits for at least 1 byte, then reads the rest of
        the frame within the configured timeout window.
        """
        assert self._serial is not None

        # Wait for the first byte (blocking up to timeout)
        header = self._serial.read(1)
        if not header:
            return  # timeout — no data

        # Read remaining bytes (LoRa packets are small, arrive at once)
        remaining = self._serial.read(MAX_FRAME_SIZE - 1)
        raw = header + remaining

        if len(raw) < 4:
            logger.debug("frame_too_short", length=len(raw))
            return

        logger.debug("serial_frame_received", length=len(raw))

        if self._on_frame:
            self._on_frame(bytes(raw))

    # ── Write (for sending commands to the LoRa gateway) ────────

    def write(self, data: bytes) -> bool:
        """Write raw bytes to the serial port.

        Args:
            data: Bytes to send.

        Returns:
            True if write succeeded.
        """
        if not self.is_connected:
            logger.error("serial_write_not_connected")
            return False

        try:
            assert self._serial is not None
            self._serial.write(data)
            self._serial.flush()
            logger.debug("serial_write", length=len(data))
            return True
        except serial.SerialException as exc:
            logger.error("serial_write_error", error=str(exc))
            self.disconnect()
            return False
