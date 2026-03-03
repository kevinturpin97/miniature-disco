"""Tests for SerialReader — uses unittest.mock to simulate serial port."""

from unittest.mock import MagicMock, patch

import pytest

from bridge.serial_reader import SerialReader


class TestSerialReaderConnect:
    """Connection and disconnection behaviour."""

    @patch("bridge.serial_reader.serial.Serial")
    def test_connect_success(self, mock_serial_cls: MagicMock) -> None:
        mock_serial_cls.return_value.is_open = True
        reader = SerialReader(port="/dev/ttyTEST", baud=9600)
        assert reader.connect() is True
        assert reader.is_connected is True
        mock_serial_cls.assert_called_once_with(
            port="/dev/ttyTEST",
            baudrate=9600,
            timeout=reader._timeout,
        )

    @patch("bridge.serial_reader.serial.Serial")
    def test_connect_failure(self, mock_serial_cls: MagicMock) -> None:
        import serial as pyserial

        mock_serial_cls.side_effect = pyserial.SerialException("port not found")
        reader = SerialReader(port="/dev/nonexistent")
        assert reader.connect() is False
        assert reader.is_connected is False

    @patch("bridge.serial_reader.serial.Serial")
    def test_disconnect(self, mock_serial_cls: MagicMock) -> None:
        reader = SerialReader()
        reader.connect()
        reader.disconnect()
        assert reader.is_connected is False


class TestSerialReaderReadOnce:
    """Frame reading from serial port."""

    @patch("bridge.serial_reader.serial.Serial")
    def test_frame_dispatched_to_callback(self, mock_serial_cls: MagicMock) -> None:
        callback = MagicMock()
        reader = SerialReader(on_frame=callback)
        reader.connect()

        # Simulate reading a 7-byte frame
        mock_port = mock_serial_cls.return_value
        mock_port.read.side_effect = [
            b"\x01",                                # first byte (header)
            b"\x01\x01\x01\x09\x29\xAB",           # remaining bytes
        ]

        reader._read_once()

        callback.assert_called_once()
        raw = callback.call_args[0][0]
        assert len(raw) == 7
        assert raw[0] == 0x01

    @patch("bridge.serial_reader.serial.Serial")
    def test_timeout_no_data(self, mock_serial_cls: MagicMock) -> None:
        callback = MagicMock()
        reader = SerialReader(on_frame=callback)
        reader.connect()

        # Simulate timeout (empty read)
        mock_port = mock_serial_cls.return_value
        mock_port.read.return_value = b""

        reader._read_once()

        callback.assert_not_called()

    @patch("bridge.serial_reader.serial.Serial")
    def test_short_frame_ignored(self, mock_serial_cls: MagicMock) -> None:
        callback = MagicMock()
        reader = SerialReader(on_frame=callback)
        reader.connect()

        # Simulate a 2-byte frame (too short)
        mock_port = mock_serial_cls.return_value
        mock_port.read.side_effect = [b"\x01", b"\x02"]

        reader._read_once()

        callback.assert_not_called()


class TestSerialReaderWrite:
    """Writing commands back to the serial port."""

    @patch("bridge.serial_reader.serial.Serial")
    def test_write_success(self, mock_serial_cls: MagicMock) -> None:
        reader = SerialReader()
        reader.connect()

        data = b"\x01\x80\x05\x01\xAB"
        assert reader.write(data) is True

        mock_port = mock_serial_cls.return_value
        mock_port.write.assert_called_once_with(data)
        mock_port.flush.assert_called_once()

    def test_write_not_connected(self) -> None:
        reader = SerialReader()
        assert reader.write(b"\x01") is False

    @patch("bridge.serial_reader.serial.Serial")
    def test_write_serial_error(self, mock_serial_cls: MagicMock) -> None:
        import serial as pyserial

        reader = SerialReader()
        reader.connect()

        mock_port = mock_serial_cls.return_value
        mock_port.write.side_effect = pyserial.SerialException("write error")

        assert reader.write(b"\x01") is False
        # Should have disconnected after error
        assert reader.is_connected is False
