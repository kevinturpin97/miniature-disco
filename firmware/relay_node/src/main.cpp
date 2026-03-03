/**
 * @file main.cpp
 * @brief Relay node main loop — read sensors, TX LoRa, RX commands, sleep.
 *
 * Power-saving cycle:
 *   1. Wake from WDT sleep
 *   2. Read all sensors
 *   3. Build and transmit a sensor data frame
 *   4. Open a short receive window for gateway commands
 *   5. Execute any received command (toggle actuator GPIO)
 *   6. Put LoRa radio to sleep
 *   7. Enter MCU deep sleep via WDT for TX_INTERVAL_MS
 */

#include "config.h"
#include "lora_transport.h"
#include "protocol_core.h"
#include "sensors.h"

#include <Arduino.h>
#include <avr/power.h>
#include <avr/sleep.h>
#include <avr/wdt.h>

// ── WDT deep-sleep helpers ─────────────────────────────────────

/// Volatile counter incremented by the WDT ISR.
static volatile uint16_t wdt_cycles = 0;

/// WDT interrupt service routine — just increments the counter.
ISR(WDT_vect) {
    wdt_cycles++;
}

/**
 * @brief Sleep the MCU for approximately @p ms milliseconds using
 *        the Watchdog Timer in interrupt-only mode (8 s granularity).
 *
 * Actual sleep ≈ ceil(ms / 8000) × 8000 ms.
 */
static void deep_sleep_ms(unsigned long ms) {
    uint16_t cycles_needed = static_cast<uint16_t>((ms + 7999UL) / 8000UL);
    wdt_cycles = 0;

    // Configure WDT for 8 s interrupt (no reset)
    cli();
    wdt_reset();
    MCUSR &= ~(1 << WDRF);
    WDTCSR |= (1 << WDCE) | (1 << WDE);
    WDTCSR = (1 << WDIE) | (1 << WDP3) | (1 << WDP0); // 8 s, interrupt mode
    sei();

    set_sleep_mode(SLEEP_MODE_PWR_DOWN);

    while (wdt_cycles < cycles_needed) {
        sleep_mode(); // enters sleep, resumes here after WDT ISR
    }

    // Disable WDT
    cli();
    wdt_reset();
    MCUSR &= ~(1 << WDRF);
    WDTCSR |= (1 << WDCE) | (1 << WDE);
    WDTCSR = 0x00;
    sei();
}

// ── Command handler ────────────────────────────────────────────

/**
 * @brief Execute a received actuator command (ON / OFF / SET_VALUE).
 */
static void handle_command(const LoRaCommand& cmd) {
    uint8_t pin = cmd.actuator_pin;
    pinMode(pin, OUTPUT);

    switch (cmd.action) {
        case ACTION_ON:
            digitalWrite(pin, HIGH);
            Serial.print(F("[CMD] pin "));
            Serial.print(pin);
            Serial.println(F(" → HIGH"));
            break;
        case ACTION_OFF:
            digitalWrite(pin, LOW);
            Serial.print(F("[CMD] pin "));
            Serial.print(pin);
            Serial.println(F(" → LOW"));
            break;
        case ACTION_SET_VALUE:
            // PWM output: value is 0–10000 mapped to 0–255
            analogWrite(pin, map(cmd.value, 0, 10000, 0, 255));
            Serial.print(F("[CMD] pin "));
            Serial.print(pin);
            Serial.print(F(" → PWM "));
            Serial.println(cmd.value);
            break;
        default:
            Serial.println(F("[CMD] unknown action"));
            break;
    }
}

// ── Sensor → frame helper ──────────────────────────────────────

/**
 * @brief Collect sensor readings and build a LoRa frame.
 *
 * @param data  Sensor readings.
 * @param frame Output frame.
 */
static void build_frame(const SensorData& data, LoRaFrame& frame) {
    SensorEntry entries[6];
    uint8_t count = 0;

    if (data.dht_ok) {
        entries[count++] = { SENSOR_TEMP,    encode_value(data.temperature_air) };
        entries[count++] = { SENSOR_HUM_AIR, encode_value(data.humidity_air) };
    }
    if (data.ds18b20_ok) {
        // DS18B20 soil/water temperature — sent as SENSOR_HUM_SOIL
        // because the protocol has only one TEMP type (reserved for air).
        // The backend maps this by zone + sensor configuration.
        entries[count++] = { SENSOR_HUM_SOIL, encode_value(data.temperature_soil) };
    }

    build_sensor_frame(RELAY_ID, entries, count, frame);
}

// ── Arduino entry points ───────────────────────────────────────

void setup() {
    Serial.begin(SERIAL_BAUD);
    Serial.print(F("[RELAY] Node "));
    Serial.print(RELAY_ID);
    Serial.println(F(" booting"));

    sensors_init();
    lora_init();

    Serial.println(F("[RELAY] Ready"));
}

void loop() {
    // 1. Read sensors
    SensorData data;
    sensors_read(data);

    // 2. Build and transmit
    LoRaFrame frame;
    build_frame(data, frame);
    lora_send(frame);

    // 3. Listen for commands
    LoRaCommand cmd;
    if (lora_receive_command(RELAY_ID, cmd, CMD_LISTEN_MS)) {
        handle_command(cmd);
    }

    // 4. Sleep
    lora_sleep();

    Serial.print(F("[RELAY] Sleeping "));
    Serial.print(TX_INTERVAL_MS / 1000UL);
    Serial.println(F("s"));
    Serial.flush();

    deep_sleep_ms(TX_INTERVAL_MS);
}
