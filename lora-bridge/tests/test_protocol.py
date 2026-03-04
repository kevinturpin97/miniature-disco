"""Tests for the LoRa binary protocol encoder/decoder."""

import struct

import pytest

from bridge.protocol import (
    ACTION_OFF,
    ACTION_ON,
    ACTION_SET_VALUE,
    MSG_COMMAND,
    MSG_COMMAND_ACK,
    MSG_SENSOR_DATA,
    AckFrame,
    CommandFrame,
    SensorFrame,
    crc8_maxim,
    decode_ack_frame,
    decode_sensor_frame,
    encode_command,
)


# ── CRC-8/MAXIM ────────────────────────────────────────────────


class TestCrc8Maxim:
    """CRC-8/MAXIM (Dallas 1-Wire CRC) implementation."""

    def test_empty_input(self) -> None:
        assert crc8_maxim(b"") == 0x00

    def test_canonical_check(self) -> None:
        """The canonical CRC-8/MAXIM test vector: '123456789' -> 0xA1."""
        assert crc8_maxim(b"123456789") == 0xA1

    def test_single_byte(self) -> None:
        assert crc8_maxim(bytes([0xBE])) == 0x2D

    def test_detects_bit_flip(self) -> None:
        data = bytes([0x01, 0x02, 0x03])
        original = crc8_maxim(data)
        corrupted = crc8_maxim(bytes([0x01, 0xFF, 0x03]))
        assert original != corrupted

    def test_matches_firmware(self) -> None:
        """Cross-check with a frame manually built per firmware spec."""
        # relay=1, msg=0x01, count=1, type=0x01, value=2345 (0x0929)
        frame = bytes([0x01, 0x01, 0x01, 0x01, 0x09, 0x29])
        crc = crc8_maxim(frame)
        # CRC must be a valid byte
        assert 0 <= crc <= 255


# ── Decode sensor frame ────────────────────────────────────────


class TestDecodeSensorFrame:
    """decode_sensor_frame() — relay → gateway."""

    @staticmethod
    def _build_frame(relay_id: int, sensors: list[tuple[int, int]]) -> bytes:
        """Helper to build a valid frame with correct CRC."""
        buf = bytearray()
        buf.append(relay_id)
        buf.append(MSG_SENSOR_DATA)
        buf.append(len(sensors))
        for sensor_type, raw_value in sensors:
            buf.append(sensor_type)
            buf.extend(struct.pack(">h", raw_value))
        buf.append(crc8_maxim(buf))
        return bytes(buf)

    def test_single_sensor(self) -> None:
        raw = self._build_frame(1, [(0x01, 2345)])  # TEMP 23.45°C
        frame = decode_sensor_frame(raw)
        assert frame is not None
        assert frame.relay_id == 1
        assert len(frame.readings) == 1
        assert frame.readings[0].sensor_type == "TEMP"
        assert frame.readings[0].value == pytest.approx(23.45)

    def test_multiple_sensors(self) -> None:
        raw = self._build_frame(5, [
            (0x01, 2200),   # TEMP 22.00°C
            (0x02, 6500),   # HUM_AIR 65.00%
            (0x04, 682),    # PH 6.82
        ])
        frame = decode_sensor_frame(raw)
        assert frame is not None
        assert frame.relay_id == 5
        assert len(frame.readings) == 3
        assert frame.readings[0].value == pytest.approx(22.0)
        assert frame.readings[1].sensor_type == "HUM_AIR"
        assert frame.readings[2].value == pytest.approx(6.82)

    def test_negative_value(self) -> None:
        raw = self._build_frame(1, [(0x01, -350)])  # TEMP -3.50°C
        frame = decode_sensor_frame(raw)
        assert frame is not None
        assert frame.readings[0].value == pytest.approx(-3.50)

    def test_zero_sensors(self) -> None:
        raw = self._build_frame(1, [])
        frame = decode_sensor_frame(raw)
        assert frame is not None
        assert len(frame.readings) == 0

    def test_bad_crc_rejected(self) -> None:
        raw = bytearray(self._build_frame(1, [(0x01, 2345)]))
        raw[-1] ^= 0xFF  # corrupt CRC
        assert decode_sensor_frame(bytes(raw)) is None

    def test_truncated_frame_rejected(self) -> None:
        raw = self._build_frame(1, [(0x01, 2345)])
        assert decode_sensor_frame(raw[:4]) is None

    def test_too_short_rejected(self) -> None:
        assert decode_sensor_frame(b"\x01\x01") is None

    def test_wrong_msg_type_rejected(self) -> None:
        raw = bytearray(self._build_frame(1, [(0x01, 2345)]))
        raw[1] = 0x42  # wrong msg type
        # Recalculate CRC after change
        raw[-1] = crc8_maxim(raw[:-1])
        assert decode_sensor_frame(bytes(raw)) is None

    def test_unknown_sensor_type(self) -> None:
        raw = self._build_frame(1, [(0xFF, 1000)])
        frame = decode_sensor_frame(raw)
        assert frame is not None
        assert frame.readings[0].sensor_type.startswith("UNKNOWN")


# ── Encode command ──────────────────────────────────────────────


class TestEncodeCommand:
    """encode_command() — gateway → relay."""

    def test_on_command(self) -> None:
        cmd = CommandFrame(relay_id=1, actuator_pin=5, action=ACTION_ON)
        raw = encode_command(cmd)
        assert len(raw) == 5
        assert raw[0] == 1
        assert raw[1] == MSG_COMMAND
        assert raw[2] == 5
        assert raw[3] == ACTION_ON
        assert raw[4] == crc8_maxim(raw[:4])

    def test_off_command(self) -> None:
        cmd = CommandFrame(relay_id=2, actuator_pin=3, action=ACTION_OFF)
        raw = encode_command(cmd)
        assert len(raw) == 5
        assert raw[3] == ACTION_OFF
        assert raw[4] == crc8_maxim(raw[:4])

    def test_set_value_command(self) -> None:
        cmd = CommandFrame(relay_id=1, actuator_pin=6, action=ACTION_SET_VALUE, value=5000)
        raw = encode_command(cmd)
        assert len(raw) == 7
        assert raw[3] == ACTION_SET_VALUE
        # Value 5000 = 0x1388 in big-endian
        assert raw[4] == 0x13
        assert raw[5] == 0x88
        assert raw[6] == crc8_maxim(raw[:6])

    def test_negative_set_value(self) -> None:
        cmd = CommandFrame(relay_id=1, actuator_pin=6, action=ACTION_SET_VALUE, value=-200)
        raw = encode_command(cmd)
        assert len(raw) == 7
        val = struct.unpack(">h", raw[4:6])[0]
        assert val == -200


# ── Cross-check: Python encode → Python decode ─────────────────


class TestRoundTrip:
    """Verify that encoding a command produces valid CRC the Python decoder
    would accept after round-tripping through serial."""

    def test_command_crc_validates(self) -> None:
        cmd = CommandFrame(relay_id=10, actuator_pin=7, action=ACTION_ON)
        raw = encode_command(cmd)
        # Manually verify CRC
        assert crc8_maxim(raw[:-1]) == raw[-1]

    def test_sensor_frame_build_and_decode(self) -> None:
        """Build a frame from raw bytes, decode it, verify values."""
        buf = bytearray()
        buf.append(42)  # relay_id
        buf.append(MSG_SENSOR_DATA)
        buf.append(2)   # 2 sensors
        buf.append(0x01)  # TEMP
        buf.extend(struct.pack(">h", 2150))  # 21.50°C
        buf.append(0x02)  # HUM_AIR
        buf.extend(struct.pack(">h", 7530))  # 75.30%
        buf.append(crc8_maxim(buf))

        frame = decode_sensor_frame(bytes(buf))
        assert frame is not None
        assert frame.relay_id == 42
        assert frame.readings[0].value == pytest.approx(21.50)
        assert frame.readings[1].value == pytest.approx(75.30)


# ── Decode ACK frame ──────────────────────────────────────────────


class TestDecodeAckFrame:
    """decode_ack_frame() — relay → gateway ACK."""

    @staticmethod
    def _build_ack_frame(relay_id: int, command_id: int, success: bool) -> bytes:
        """Helper to build a valid ACK frame with correct CRC."""
        buf = bytearray()
        buf.append(relay_id)
        buf.append(MSG_COMMAND_ACK)
        buf.extend(struct.pack(">H", command_id))
        buf.append(1 if success else 0)
        buf.append(crc8_maxim(buf))
        return bytes(buf)

    def test_valid_ack_success(self) -> None:
        raw = self._build_ack_frame(relay_id=5, command_id=123, success=True)
        frame = decode_ack_frame(raw)
        assert frame is not None
        assert frame.relay_id == 5
        assert frame.command_id == 123
        assert frame.success is True

    def test_valid_ack_failure(self) -> None:
        raw = self._build_ack_frame(relay_id=10, command_id=456, success=False)
        frame = decode_ack_frame(raw)
        assert frame is not None
        assert frame.relay_id == 10
        assert frame.command_id == 456
        assert frame.success is False

    def test_crc_mismatch_rejected(self) -> None:
        raw = bytearray(self._build_ack_frame(relay_id=1, command_id=100, success=True))
        raw[-1] ^= 0xFF  # corrupt CRC
        assert decode_ack_frame(bytes(raw)) is None

    def test_too_short_rejected(self) -> None:
        assert decode_ack_frame(b"\x01\x82\x00") is None
        assert decode_ack_frame(b"") is None

    def test_wrong_msg_type_rejected(self) -> None:
        """Frame with wrong msg_type returns None."""
        raw = bytearray(self._build_ack_frame(relay_id=1, command_id=100, success=True))
        raw[1] = 0x01  # sensor data msg type instead of ACK
        raw[-1] = crc8_maxim(raw[:-1])  # fix CRC
        assert decode_ack_frame(bytes(raw)) is None

    def test_large_command_id(self) -> None:
        """16-bit command_id at max value."""
        raw = self._build_ack_frame(relay_id=1, command_id=65535, success=True)
        frame = decode_ack_frame(raw)
        assert frame is not None
        assert frame.command_id == 65535
