/**
 * @file protocol_core.h
 * @brief Binary LoRa protocol — encoding, CRC8, frame builder.
 *
 * Header-only, pure C++ (no Arduino dependency) so it can be
 * unit-tested on the native platform without hardware.
 *
 * Wire format (relay → gateway, MSG_TYPE 0x01):
 * ┌──────────┬──────────┬────────────┬──────────────────────┬──────┐
 * │ RELAY_ID │ MSG_TYPE │ SENSOR_CNT │ [TYPE VALUE] × N     │ CRC8 │
 * │ uint8    │ 0x01     │ uint8      │ N × 3 bytes          │ uint8│
 * └──────────┴──────────┴────────────┴──────────────────────┴──────┘
 *
 * Wire format (gateway → relay, MSG_TYPE 0x80):
 * ┌──────────┬──────────┬──────────────┬─────────┬──────┐
 * │ RELAY_ID │ MSG_TYPE │ ACTUATOR_PIN │ ACTION  │ CRC8 │
 * │ uint8    │ 0x80     │ uint8        │ uint8   │ uint8│
 * └──────────┴──────────┴──────────────┴─────────┴──────┘
 *
 * Values are int16_t (big-endian), real × 100.
 */

#pragma once

#include <math.h>
#include <stdint.h>
#include <string.h>

// ── Message types ──────────────────────────────────────────────
static const uint8_t MSG_SENSOR_DATA = 0x01;
static const uint8_t MSG_COMMAND     = 0x80;

// ── Sensor type codes ──────────────────────────────────────────
static const uint8_t SENSOR_TEMP     = 0x01;
static const uint8_t SENSOR_HUM_AIR  = 0x02;
static const uint8_t SENSOR_HUM_SOIL = 0x03;
static const uint8_t SENSOR_PH       = 0x04;
static const uint8_t SENSOR_LIGHT    = 0x05;
static const uint8_t SENSOR_CO2      = 0x06;

// ── Command action codes ───────────────────────────────────────
static const uint8_t ACTION_OFF       = 0x00;
static const uint8_t ACTION_ON        = 0x01;
static const uint8_t ACTION_SET_VALUE = 0x02;

// ── Constants ──────────────────────────────────────────────────
/// Maximum frame size: 1 + 1 + 1 + (6 sensors × 3 bytes) + 1 CRC = 22
static const uint8_t MAX_FRAME_SIZE = 24;

// ── Structures ─────────────────────────────────────────────────

/** @brief Encoded LoRa frame ready for transmission. */
struct LoRaFrame {
    uint8_t buf[MAX_FRAME_SIZE];
    uint8_t len;
};

/** @brief A single sensor entry before framing. */
struct SensorEntry {
    uint8_t type;
    int16_t value; ///< Real value × 100
};

/** @brief Decoded inbound command from the gateway. */
struct LoRaCommand {
    uint8_t relay_id;
    uint8_t actuator_pin;
    uint8_t action;
    int16_t value;  ///< Only meaningful when action == ACTION_SET_VALUE
    bool    valid;  ///< True if CRC check passed
};

// ── Inline implementations ─────────────────────────────────────

/**
 * @brief Convert a float sensor reading to the wire-format int16 (× 100).
 *
 * Example: 23.45 °C → 2345, pH 6.82 → 682.
 */
inline int16_t encode_value(float val) {
    return static_cast<int16_t>(roundf(val * 100.0f));
}

/**
 * @brief Compute CRC-8/MAXIM (Dallas 1-Wire CRC).
 *
 * Polynomial 0x31 (reflected 0x8C), init 0x00.
 */
inline uint8_t crc8_maxim(const uint8_t* data, uint8_t length) {
    uint8_t crc = 0x00;
    for (uint8_t i = 0; i < length; i++) {
        uint8_t b = data[i];
        for (uint8_t bit = 0; bit < 8; bit++) {
            if ((crc ^ b) & 0x01) {
                crc = (crc >> 1) ^ 0x8C;
            } else {
                crc >>= 1;
            }
            b >>= 1;
        }
    }
    return crc;
}

/**
 * @brief Build a MSG_SENSOR_DATA frame from an array of sensor entries.
 *
 * @param relay_id  Unique relay identifier.
 * @param entries   Array of SensorEntry structs.
 * @param count     Number of entries (max 6).
 * @param frame     Output frame populated on return.
 */
inline void build_sensor_frame(uint8_t relay_id,
                                const SensorEntry* entries,
                                uint8_t count,
                                LoRaFrame& frame) {
    uint8_t idx = 0;
    uint8_t* buf = frame.buf;

    buf[idx++] = relay_id;
    buf[idx++] = MSG_SENSOR_DATA;
    buf[idx++] = count;

    for (uint8_t i = 0; i < count; i++) {
        buf[idx++] = entries[i].type;
        buf[idx++] = static_cast<uint8_t>(entries[i].value >> 8);   // high byte
        buf[idx++] = static_cast<uint8_t>(entries[i].value & 0xFF); // low byte
    }

    buf[idx] = crc8_maxim(buf, idx);
    idx++;

    frame.len = idx;
}

/**
 * @brief Decode a command frame received from the gateway.
 *
 * Expected format: [RELAY_ID, 0x80, ACTUATOR_PIN, ACTION, CRC8]
 * For ACTION_SET_VALUE: [RELAY_ID, 0x80, ACTUATOR_PIN, 0x02, VAL_HI, VAL_LO, CRC8]
 *
 * @param data   Raw received bytes.
 * @param length Number of bytes received.
 * @return LoRaCommand with `valid` set according to CRC check.
 */
inline LoRaCommand decode_command(const uint8_t* data, uint8_t length) {
    LoRaCommand cmd;
    memset(&cmd, 0, sizeof(cmd));
    cmd.valid = false;

    // Minimum command frame: 5 bytes (relay_id, msg_type, pin, action, crc)
    if (length < 5) return cmd;
    if (data[1] != MSG_COMMAND) return cmd;

    // Determine expected length based on action
    uint8_t action = data[3];
    uint8_t expected_len = (action == ACTION_SET_VALUE) ? 7 : 5;
    if (length < expected_len) return cmd;

    // CRC check over all bytes except the last (CRC byte itself)
    uint8_t payload_len = expected_len - 1;
    uint8_t expected_crc = crc8_maxim(data, payload_len);
    if (data[payload_len] != expected_crc) return cmd;

    cmd.relay_id     = data[0];
    cmd.actuator_pin = data[2];
    cmd.action       = action;
    cmd.valid        = true;

    if (action == ACTION_SET_VALUE) {
        cmd.value = static_cast<int16_t>(
            (static_cast<uint16_t>(data[4]) << 8) | data[5]
        );
    }

    return cmd;
}
