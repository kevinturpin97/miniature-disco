#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>

// ── LoRa pins — Heltec WiFi LoRa 32 V2  /  TTGO LoRa32 V1+V2 ───────────
//
//   Same pinout on both boards:
//   SCK=5  MISO=19  MOSI=27  SS=18  RST=14  DIO0=26
//
//   Bare ESP32 + external SX1278 (RA-02) wired via SPI:
//     pick any free GPIO for SS/RST/DIO0 and update defines below.
//
#define LORA_SCK   5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_SS    18
#define LORA_RST   14
#define LORA_DIO0  26

// Match this to the relay node firmware (868 MHz = Europe, 915 MHz = US/AU)
#define LORA_FREQ  868E6

// Match relay node LoRa modem settings
#define LORA_SF    7        // Spreading Factor
#define LORA_BW    125E3    // Bandwidth Hz
#define LORA_CR    5        // Coding Rate denominator (4/5)

#define BAUD_RATE  115200

// ── Setup ────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(BAUD_RATE);
    delay(2000);  // wait for USB CDC

    SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
    LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

    if (!LoRa.begin(LORA_FREQ)) {
        // Blocking — if LoRa init fails the lora-bridge will see no data
        while (true) {
            delay(1000);
        }
    }

    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(LORA_BW);
    LoRa.setCodingRate4(LORA_CR);
    LoRa.receive();  // put radio into continuous receive mode

#ifdef LED_BUILTIN
    pinMode(LED_BUILTIN, OUTPUT);
#endif
}

// ── Loop ─────────────────────────────────────────────────────────────────

void loop() {
    int packetSize = LoRa.parsePacket();
    if (packetSize <= 0) {
        return;
    }

    // Read raw bytes from the LoRa packet
    uint8_t buf[32];
    int n = 0;
    while (LoRa.available() && n < (int)sizeof(buf)) {
        buf[n++] = (uint8_t)LoRa.read();
    }

    if (n < 4) {
        return;  // too short to be a valid frame — drop
    }

    // Forward raw bytes verbatim to USB Serial.
    // lora-bridge reads these exactly as if the relay was connected directly.
    Serial.write(buf, n);
    Serial.flush();

#ifdef LED_BUILTIN
    digitalWrite(LED_BUILTIN, HIGH);
    delay(50);
    digitalWrite(LED_BUILTIN, LOW);
#endif
}
