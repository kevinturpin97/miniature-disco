/**
 * @file config.h
 * @brief Relay node configuration — edit before flashing each node.
 */

#pragma once

// ── Node identity ──────────────────────────────────────────────
/// Unique relay ID (1–255). Must match the Zone.relay_id in Django.
#define RELAY_ID         1

// ── Timing ─────────────────────────────────────────────────────
/// Transmission interval in milliseconds (default 5 min).
#define TX_INTERVAL_MS   (5UL * 60UL * 1000UL)

/// Command receive window after each TX (ms).
#define CMD_LISTEN_MS    2000

// ── LoRa radio (RFM95W wiring for Arduino Nano) ───────────────
#define LORA_SS_PIN      10    // NSS / CS
#define LORA_RST_PIN     9
#define LORA_DIO0_PIN    2
#define LORA_FREQUENCY   868E6 // 868 MHz (EU ISM band)
#define LORA_TX_POWER    14    // dBm (max 20 for RFM95W)
#define LORA_SF          9     // Spreading Factor (7–12)
#define LORA_BW          125E3 // Bandwidth (Hz)

// ── Sensor pins ────────────────────────────────────────────────
#define DHT_PIN          7
#define DHT_TYPE         DHT22
#define ONE_WIRE_BUS     8     // DS18B20 data pin

// ── Sensor enable flags ────────────────────────────────────────
/// Set to 0 to disable a sensor that is not wired on this node.
#define ENABLE_DHT22     1
#define ENABLE_DS18B20   1

// ── Serial ─────────────────────────────────────────────────────
#define SERIAL_BAUD      115200
