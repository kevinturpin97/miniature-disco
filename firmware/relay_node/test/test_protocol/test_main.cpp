/**
 * @file test_main.cpp
 * @brief Unit tests for protocol_core.h — runs on native platform (no hardware).
 *
 * Uses PlatformIO's built-in Unity test framework.
 */

#include <unity.h>
#include "../../src/protocol_core.h"

// ── CRC-8/MAXIM tests ─────────────────────────────────────────

void test_crc8_empty(void) {
    uint8_t crc = crc8_maxim(nullptr, 0);
    TEST_ASSERT_EQUAL_UINT8(0x00, crc);
}

void test_crc8_single_byte(void) {
    uint8_t data[] = {0xBE};
    uint8_t crc = crc8_maxim(data, 1);
    // CRC-8/MAXIM for 0xBE = 0x2D (verified against canonical "123456789" test)
    TEST_ASSERT_EQUAL_UINT8(0x2D, crc);
}

void test_crc8_known_sequence(void) {
    // "123456789" → CRC-8/MAXIM = 0xA1
    uint8_t data[] = {0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39};
    uint8_t crc = crc8_maxim(data, 9);
    TEST_ASSERT_EQUAL_UINT8(0xA1, crc);
}

void test_crc8_detects_corruption(void) {
    uint8_t data[] = {0x01, 0x02, 0x03};
    uint8_t original_crc = crc8_maxim(data, 3);
    data[1] = 0xFF; // corrupt one byte
    uint8_t corrupted_crc = crc8_maxim(data, 3);
    TEST_ASSERT_NOT_EQUAL(original_crc, corrupted_crc);
}

// ── encode_value tests ─────────────────────────────────────────

void test_encode_positive(void) {
    TEST_ASSERT_EQUAL_INT16(2345, encode_value(23.45f));
}

void test_encode_negative(void) {
    TEST_ASSERT_EQUAL_INT16(-520, encode_value(-5.20f));
}

void test_encode_zero(void) {
    TEST_ASSERT_EQUAL_INT16(0, encode_value(0.0f));
}

void test_encode_ph(void) {
    TEST_ASSERT_EQUAL_INT16(682, encode_value(6.82f));
}

void test_encode_humidity(void) {
    TEST_ASSERT_EQUAL_INT16(6750, encode_value(67.50f));
}

// ── build_sensor_frame tests ───────────────────────────────────

void test_frame_single_sensor(void) {
    SensorEntry entries[] = {
        {SENSOR_TEMP, encode_value(23.45f)}
    };
    LoRaFrame frame;
    build_sensor_frame(0x01, entries, 1, frame);

    // Expected: [relay, msg, cnt, type, val_hi, val_lo, CRC] = 7 bytes
    TEST_ASSERT_EQUAL_UINT8(7, frame.len);
    TEST_ASSERT_EQUAL_UINT8(0x01, frame.buf[0]); // relay_id
    TEST_ASSERT_EQUAL_UINT8(MSG_SENSOR_DATA, frame.buf[1]); // msg_type
    TEST_ASSERT_EQUAL_UINT8(1, frame.buf[2]); // sensor count
    TEST_ASSERT_EQUAL_UINT8(SENSOR_TEMP, frame.buf[3]); // sensor type
    // Value = 2345 = 0x0929
    TEST_ASSERT_EQUAL_UINT8(0x09, frame.buf[4]); // high byte
    TEST_ASSERT_EQUAL_UINT8(0x29, frame.buf[5]); // low byte

    // CRC covers bytes 0..5 (6 bytes), byte 6 is CRC
    uint8_t expected_crc = crc8_maxim(frame.buf, 6);
    TEST_ASSERT_EQUAL_UINT8(expected_crc, frame.buf[6]);
}

void test_frame_multiple_sensors(void) {
    SensorEntry entries[] = {
        {SENSOR_TEMP,    encode_value(22.0f)},
        {SENSOR_HUM_AIR, encode_value(65.0f)},
    };
    LoRaFrame frame;
    build_sensor_frame(0x05, entries, 2, frame);

    // 1 + 1 + 1 + (2 * 3) + 1 CRC = 10
    TEST_ASSERT_EQUAL_UINT8(10, frame.len);
    TEST_ASSERT_EQUAL_UINT8(0x05, frame.buf[0]);
    TEST_ASSERT_EQUAL_UINT8(2, frame.buf[2]); // 2 sensors

    // Verify CRC is correct
    uint8_t expected_crc = crc8_maxim(frame.buf, frame.len - 1);
    TEST_ASSERT_EQUAL_UINT8(expected_crc, frame.buf[frame.len - 1]);
}

void test_frame_zero_sensors(void) {
    LoRaFrame frame;
    build_sensor_frame(0x01, nullptr, 0, frame);

    // 1 + 1 + 1 + 0 + 1 CRC = 4
    TEST_ASSERT_EQUAL_UINT8(4, frame.len);
    TEST_ASSERT_EQUAL_UINT8(0, frame.buf[2]); // sensor count = 0
}

// ── decode_command tests ───────────────────────────────────────

void test_decode_on_command(void) {
    // Build a valid ON command: [relay=0x01, msg=0x80, pin=5, action=ON, CRC]
    uint8_t buf[5] = {0x01, MSG_COMMAND, 5, ACTION_ON, 0};
    buf[4] = crc8_maxim(buf, 4);

    LoRaCommand cmd = decode_command(buf, 5);
    TEST_ASSERT_TRUE(cmd.valid);
    TEST_ASSERT_EQUAL_UINT8(0x01, cmd.relay_id);
    TEST_ASSERT_EQUAL_UINT8(5, cmd.actuator_pin);
    TEST_ASSERT_EQUAL_UINT8(ACTION_ON, cmd.action);
}

void test_decode_off_command(void) {
    uint8_t buf[5] = {0x02, MSG_COMMAND, 3, ACTION_OFF, 0};
    buf[4] = crc8_maxim(buf, 4);

    LoRaCommand cmd = decode_command(buf, 5);
    TEST_ASSERT_TRUE(cmd.valid);
    TEST_ASSERT_EQUAL_UINT8(ACTION_OFF, cmd.action);
}

void test_decode_set_value_command(void) {
    // SET_VALUE command: [relay, msg, pin, 0x02, val_hi, val_lo, CRC]
    int16_t val = 5000; // 50.00
    uint8_t buf[7] = {
        0x01, MSG_COMMAND, 6, ACTION_SET_VALUE,
        static_cast<uint8_t>(val >> 8),
        static_cast<uint8_t>(val & 0xFF),
        0
    };
    buf[6] = crc8_maxim(buf, 6);

    LoRaCommand cmd = decode_command(buf, 7);
    TEST_ASSERT_TRUE(cmd.valid);
    TEST_ASSERT_EQUAL_UINT8(ACTION_SET_VALUE, cmd.action);
    TEST_ASSERT_EQUAL_INT16(5000, cmd.value);
}

void test_decode_bad_crc_rejected(void) {
    uint8_t buf[5] = {0x01, MSG_COMMAND, 5, ACTION_ON, 0xFF}; // wrong CRC
    LoRaCommand cmd = decode_command(buf, 5);
    TEST_ASSERT_FALSE(cmd.valid);
}

void test_decode_too_short_rejected(void) {
    uint8_t buf[3] = {0x01, MSG_COMMAND, 5};
    LoRaCommand cmd = decode_command(buf, 3);
    TEST_ASSERT_FALSE(cmd.valid);
}

void test_decode_wrong_msg_type_rejected(void) {
    uint8_t buf[5] = {0x01, 0x42, 5, ACTION_ON, 0};
    buf[4] = crc8_maxim(buf, 4);
    LoRaCommand cmd = decode_command(buf, 5);
    TEST_ASSERT_FALSE(cmd.valid);
}

// ── Round-trip test ────────────────────────────────────────────

void test_encode_decode_roundtrip(void) {
    // Build a frame, verify the CRC embedded in it is consistent
    SensorEntry entries[] = {
        {SENSOR_TEMP,     encode_value(-3.5f)},
        {SENSOR_HUM_AIR,  encode_value(89.2f)},
        {SENSOR_PH,       encode_value(6.5f)},
    };
    LoRaFrame frame;
    build_sensor_frame(42, entries, 3, frame);

    // Recompute CRC over payload (all but last byte)
    uint8_t recomputed = crc8_maxim(frame.buf, frame.len - 1);
    TEST_ASSERT_EQUAL_UINT8(recomputed, frame.buf[frame.len - 1]);

    // Verify header
    TEST_ASSERT_EQUAL_UINT8(42, frame.buf[0]);
    TEST_ASSERT_EQUAL_UINT8(MSG_SENSOR_DATA, frame.buf[1]);
    TEST_ASSERT_EQUAL_UINT8(3, frame.buf[2]);
}

// ── Test runner ────────────────────────────────────────────────

int main(int argc, char** argv) {
    UNITY_BEGIN();

    // CRC8
    RUN_TEST(test_crc8_empty);
    RUN_TEST(test_crc8_single_byte);
    RUN_TEST(test_crc8_known_sequence);
    RUN_TEST(test_crc8_detects_corruption);

    // encode_value
    RUN_TEST(test_encode_positive);
    RUN_TEST(test_encode_negative);
    RUN_TEST(test_encode_zero);
    RUN_TEST(test_encode_ph);
    RUN_TEST(test_encode_humidity);

    // build_sensor_frame
    RUN_TEST(test_frame_single_sensor);
    RUN_TEST(test_frame_multiple_sensors);
    RUN_TEST(test_frame_zero_sensors);

    // decode_command
    RUN_TEST(test_decode_on_command);
    RUN_TEST(test_decode_off_command);
    RUN_TEST(test_decode_set_value_command);
    RUN_TEST(test_decode_bad_crc_rejected);
    RUN_TEST(test_decode_too_short_rejected);
    RUN_TEST(test_decode_wrong_msg_type_rejected);

    // Round-trip
    RUN_TEST(test_encode_decode_roundtrip);

    return UNITY_END();
}
