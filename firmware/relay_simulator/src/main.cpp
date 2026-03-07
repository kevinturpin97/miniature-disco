#include <Arduino.h>

/**
 * relay_simulator.ino
 *
 * Simulates a LoRa relay node for development/testing without real hardware.
 * Sends the same binary protocol as the production relay (ATmega328P + RFM95W)
 * but over USB Serial instead of LoRa radio.
 *
 * The lora-bridge running on the Mac/Raspberry Pi reads from the serial port
 * and processes these frames exactly as it would from a real relay.
 *
 * Frame format (sensor data, MSG_TYPE 0x01):
 *   [RELAY_ID][0x01][SENSOR_CNT][[TYPE(1B) VALUE_HI VALUE_LO] x N][CRC8]
 *
 * Values: int16 big-endian, real value x 100
 *   e.g. 23.45°C → 2345 → 0x09 0x21
 *        65.0%   → 6500 → 0x19 0x64
 *
 * CRC: CRC-8/MAXIM (poly 0x31 reflected as 0x8C, init 0x00)
 *
 * Compatible with: ESP32, ESP8266, Arduino Uno/Nano/Mega
 * Baud rate: 115200
 */

// ── Configuration ──────────────────────────────────────────────────────────

#define RELAY_ID        1       // Must match Zone.relay_id in Django
#define SEND_INTERVAL   5000    // ms between frames (must be > SERIAL_TIMEOUT=2s)
#define BAUD_RATE       115200

// Sensor type codes (must match protocol.py SENSOR_TYPE_MAP)
#define SENSOR_TEMP     0x01
#define SENSOR_HUM_AIR  0x02
#define SENSOR_HUM_SOIL 0x03
#define SENSOR_PH       0x04
#define SENSOR_LIGHT    0x05
#define SENSOR_CO2      0x06

// Message type
#define MSG_SENSOR_DATA 0x01

// ── CRC-8/MAXIM ────────────────────────────────────────────────────────────

uint8_t crc8_maxim(const uint8_t* data, uint8_t len) {
    uint8_t crc = 0x00;
    for (uint8_t i = 0; i < len; i++) {
        uint8_t byte = data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if ((crc ^ byte) & 0x01) {
                crc = (crc >> 1) ^ 0x8C;
            } else {
                crc >>= 1;
            }
            byte >>= 1;
        }
    }
    return crc;
}

// ── Frame builder ──────────────────────────────────────────────────────────

/**
 * Build and send a sensor data frame over Serial.
 *
 * @param relay_id   Relay node ID (matches Zone.relay_id in Django)
 * @param readings   Array of {sensor_type, value_x100} pairs
 * @param count      Number of readings
 */
void sendSensorFrame(uint8_t relay_id, int16_t values[], uint8_t types[], uint8_t count) {
    uint8_t buf[24];  // MAX_FRAME_SIZE = 24
    uint8_t idx = 0;

    buf[idx++] = relay_id;
    buf[idx++] = MSG_SENSOR_DATA;
    buf[idx++] = count;

    for (uint8_t i = 0; i < count; i++) {
        buf[idx++] = types[i];
        buf[idx++] = (values[i] >> 8) & 0xFF;  // big-endian high byte
        buf[idx++] = values[i] & 0xFF;          // big-endian low byte
    }

    uint8_t crc = crc8_maxim(buf, idx);
    buf[idx++] = crc;

    Serial.write(buf, idx);
    Serial.flush();
}

// ── Simulated sensor readings ──────────────────────────────────────────────

float simTemp    = 22.5;   // °C
float simHumAir  = 65.0;   // %
float simHumSoil = 45.0;   // %

void driftValues() {
    // Gentle random drift to simulate realistic sensor variation
    simTemp    += ((float)random(-20, 20)) / 100.0;
    simHumAir  += ((float)random(-50, 50)) / 100.0;
    simHumSoil += ((float)random(-30, 30)) / 100.0;

    // Keep within realistic bounds
    simTemp    = constrain(simTemp,    10.0, 40.0);
    simHumAir  = constrain(simHumAir,  30.0, 95.0);
    simHumSoil = constrain(simHumSoil, 10.0, 90.0);
}

// ── Setup & Loop ───────────────────────────────────────────────────────────

void setup() {
    Serial.begin(BAUD_RATE);

    // Wait for serial to be ready (important for ESP32 + USB CDC)
    delay(2000);

    randomSeed(analogRead(0));

    // Signal ready on built-in LED if available
#ifdef LED_BUILTIN
    pinMode(LED_BUILTIN, OUTPUT);
#endif
}

void loop() {
    driftValues();

    // Build readings: TEMP + HUM_AIR + HUM_SOIL
    uint8_t types[]  = { SENSOR_TEMP, SENSOR_HUM_AIR, SENSOR_HUM_SOIL };
    int16_t values[] = {
        (int16_t)(simTemp    * 100),
        (int16_t)(simHumAir  * 100),
        (int16_t)(simHumSoil * 100),
    };
    uint8_t count = sizeof(types) / sizeof(types[0]);

    sendSensorFrame(RELAY_ID, values, types, count);

    // Blink to show activity
#ifdef LED_BUILTIN
    digitalWrite(LED_BUILTIN, HIGH);
    delay(100);
    digitalWrite(LED_BUILTIN, LOW);
#endif

    delay(SEND_INTERVAL);
}
