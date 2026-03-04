"""LoRa binary protocol encoder/decoder.

Mirrors the C++ protocol_core.h implementation.

Sensor data frame (relay → gateway, MSG_TYPE 0x01):
    [RELAY_ID][0x01][SENSOR_CNT][[TYPE(1B) VALUE(2B)] × N][CRC8]

Command frame (gateway → relay, MSG_TYPE 0x80):
    [RELAY_ID][0x80][ACTUATOR_PIN][ACTION][CRC8]
    For SET_VALUE (0x02):
    [RELAY_ID][0x80][ACTUATOR_PIN][0x02][VALUE_HI][VALUE_LO][CRC8]

Values are int16, big-endian, real × 100.
CRC: CRC-8/MAXIM (polynomial 0x31 reflected as 0x8C, init 0x00).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from typing import Final

import structlog

logger = structlog.get_logger(__name__)

# ── Constants ───────────────────────────────────────────────────

MSG_SENSOR_DATA: Final[int] = 0x01
MSG_COMMAND: Final[int] = 0x80

ACTION_OFF: Final[int] = 0x00
ACTION_ON: Final[int] = 0x01
ACTION_SET_VALUE: Final[int] = 0x02
MSG_COMMAND_ACK: Final[int] = 0x82

SENSOR_TYPE_MAP: Final[dict[int, str]] = {
    0x01: "TEMP",
    0x02: "HUM_AIR",
    0x03: "HUM_SOIL",
    0x04: "PH",
    0x05: "LIGHT",
    0x06: "CO2",
}

# ── Data classes ────────────────────────────────────────────────


@dataclass
class SensorReading:
    """A single decoded sensor reading."""

    sensor_type: str  # e.g. "TEMP", "HUM_AIR"
    value: float      # Real value (already divided by 100)


@dataclass
class SensorFrame:
    """A decoded sensor data frame from a relay node."""

    relay_id: int
    readings: list[SensorReading] = field(default_factory=list)


@dataclass
class CommandFrame:
    """A command to send to a relay node."""

    relay_id: int
    actuator_pin: int
    action: int       # ACTION_ON / ACTION_OFF / ACTION_SET_VALUE
    value: int = 0    # Only for ACTION_SET_VALUE (raw int16, already × 100)


@dataclass
class AckFrame:
    """A decoded command acknowledgment frame from a relay node."""

    relay_id: int
    command_id: int
    success: bool


# ── CRC-8/MAXIM ────────────────────────────────────────────────


def crc8_maxim(data: bytes | bytearray) -> int:
    """Compute CRC-8/MAXIM (Dallas 1-Wire CRC).

    Args:
        data: Input bytes to checksum.

    Returns:
        CRC byte (0–255).
    """
    crc = 0x00
    for byte in data:
        for _ in range(8):
            if (crc ^ byte) & 0x01:
                crc = (crc >> 1) ^ 0x8C
            else:
                crc >>= 1
            byte >>= 1
    return crc


# ── Decoder ─────────────────────────────────────────────────────


def decode_sensor_frame(raw: bytes) -> SensorFrame | None:
    """Decode a raw sensor data frame from a relay node.

    Args:
        raw: Raw bytes received from the serial port.

    Returns:
        SensorFrame on success, None if the frame is invalid.
    """
    if len(raw) < 4:
        logger.warning("frame_too_short", length=len(raw))
        return None

    relay_id = raw[0]
    msg_type = raw[1]

    if msg_type != MSG_SENSOR_DATA:
        logger.warning("unexpected_msg_type", msg_type=hex(msg_type))
        return None

    sensor_count = raw[2]
    expected_len = 3 + (sensor_count * 3) + 1  # header + payload + CRC

    if len(raw) < expected_len:
        logger.warning(
            "frame_incomplete",
            expected=expected_len,
            actual=len(raw),
        )
        return None

    # Validate CRC
    payload = raw[: expected_len - 1]
    expected_crc = crc8_maxim(payload)
    actual_crc = raw[expected_len - 1]

    if expected_crc != actual_crc:
        logger.warning(
            "crc_mismatch",
            expected=hex(expected_crc),
            actual=hex(actual_crc),
            relay_id=relay_id,
        )
        return None

    # Parse sensor readings
    readings: list[SensorReading] = []
    offset = 3
    for _ in range(sensor_count):
        sensor_type_code = raw[offset]
        raw_value = struct.unpack(">h", raw[offset + 1 : offset + 3])[0]
        real_value = raw_value / 100.0

        type_name = SENSOR_TYPE_MAP.get(sensor_type_code, f"UNKNOWN_{sensor_type_code:#x}")
        readings.append(SensorReading(sensor_type=type_name, value=real_value))
        offset += 3

    frame = SensorFrame(relay_id=relay_id, readings=readings)
    logger.info(
        "sensor_frame_decoded",
        relay_id=relay_id,
        sensor_count=sensor_count,
        readings=[(r.sensor_type, r.value) for r in readings],
    )
    return frame


# ── Encoder ─────────────────────────────────────────────────────


def encode_command(cmd: CommandFrame) -> bytes:
    """Encode a command frame to send to a relay node via LoRa.

    Args:
        cmd: Command to encode.

    Returns:
        Raw bytes ready for serial transmission.
    """
    buf = bytearray()
    buf.append(cmd.relay_id)
    buf.append(MSG_COMMAND)
    buf.append(cmd.actuator_pin)
    buf.append(cmd.action)

    if cmd.action == ACTION_SET_VALUE:
        buf.extend(struct.pack(">h", cmd.value))

    crc = crc8_maxim(buf)
    buf.append(crc)

    logger.info(
        "command_encoded",
        relay_id=cmd.relay_id,
        pin=cmd.actuator_pin,
        action=cmd.action,
        length=len(buf),
    )
    return bytes(buf)


def decode_ack_frame(raw: bytes) -> AckFrame | None:
    """Decode a command acknowledgment frame from a relay node.

    Frame format:
        [RELAY_ID][0x82][CMD_ID_HI][CMD_ID_LO][STATUS(0=fail,1=ok)][CRC8]

    Args:
        raw: Raw bytes received from the serial port.

    Returns:
        AckFrame on success, None if the frame is invalid.
    """
    if len(raw) < 6:
        logger.warning("ack_frame_too_short", length=len(raw))
        return None

    relay_id = raw[0]
    msg_type = raw[1]

    if msg_type != MSG_COMMAND_ACK:
        return None

    # Validate CRC
    payload = raw[:5]
    expected_crc = crc8_maxim(payload)
    actual_crc = raw[5]

    if expected_crc != actual_crc:
        logger.warning(
            "ack_crc_mismatch",
            expected=hex(expected_crc),
            actual=hex(actual_crc),
            relay_id=relay_id,
        )
        return None

    command_id = struct.unpack(">H", raw[2:4])[0]
    status = raw[4]

    frame = AckFrame(
        relay_id=relay_id,
        command_id=command_id,
        success=(status == 1),
    )
    logger.info(
        "ack_frame_decoded",
        relay_id=relay_id,
        command_id=command_id,
        success=frame.success,
    )
    return frame
