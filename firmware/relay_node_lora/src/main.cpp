#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>

// ── Configuration ─────────────────────────────────────────────────────────

#define RELAY_ID        1       // Must match Zone.relay_id in Django
#define SEND_INTERVAL   10000   // ms between transmissions (10s for testing)

// ── LoRa pins — Heltec WiFi LoRa 32 V2  /  TTGO LoRa32 V1+V2 ───────────
#define LORA_SCK   5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_SS    18
#define LORA_RST   14
#define LORA_DIO0  26

#define LORA_FREQ  868E6   // 868 MHz Europe — use 915E6 for US/AU
#define LORA_SF    7
#define LORA_BW    125E3
#define LORA_CR    5

// Sensor type codes (mirrors protocol.py SENSOR_TYPE_MAP)
#define SENSOR_TEMP       0x01
#define SENSOR_HUM_AIR    0x02
#define SENSOR_HUM_SOIL   0x03

// Message type
#define MSG_SENSOR_DATA   0x01

// ── Simulated sensor state ────────────────────────────────────────────────

static float sim_temp     = 22.0f;
static float sim_hum_air  = 60.0f;
static float sim_hum_soil = 45.0f;

// ── CRC-8/MAXIM ───────────────────────────────────────────────────────────

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

// ── Frame builder + LoRa TX ───────────────────────────────────────────────

void sendSensorFrame(uint8_t relay_id, uint8_t types[], int16_t values[], uint8_t count) {
    uint8_t buf[24];
    uint8_t idx = 0;

    buf[idx++] = relay_id;
    buf[idx++] = MSG_SENSOR_DATA;
    buf[idx++] = count;

    for (uint8_t i = 0; i < count; i++) {
        buf[idx++] = types[i];
        buf[idx++] = (values[i] >> 8) & 0xFF;  // big-endian
        buf[idx++] = values[i] & 0xFF;
    }

    buf[idx++] = crc8_maxim(buf, idx);

    LoRa.beginPacket();
    LoRa.write(buf, idx);
    LoRa.endPacket();  // blocking send
}

// ── Setup & Loop ──────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(2000);

    SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
    LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

    if (!LoRa.begin(LORA_FREQ)) {
        while (true) { delay(1000); }
    }

    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(LORA_BW);
    LoRa.setCodingRate4(LORA_CR);

#ifdef LED_BUILTIN
    pinMode(LED_BUILTIN, OUTPUT);
#endif
}

void loop() {
    // Drift simulated values slowly ±0.5 each cycle
    sim_temp     += ((float)random(-50, 50)) / 100.0f;
    sim_hum_air  += ((float)random(-50, 50)) / 100.0f;
    sim_hum_soil += ((float)random(-50, 50)) / 100.0f;

    // Clamp to realistic ranges
    sim_temp     = constrain(sim_temp,     15.0f,  40.0f);
    sim_hum_air  = constrain(sim_hum_air,  30.0f, 100.0f);
    sim_hum_soil = constrain(sim_hum_soil, 10.0f, 100.0f);

    uint8_t  types[3]  = { SENSOR_TEMP, SENSOR_HUM_AIR, SENSOR_HUM_SOIL };
    int16_t  values[3] = {
        (int16_t)(sim_temp     * 100),
        (int16_t)(sim_hum_air  * 100),
        (int16_t)(sim_hum_soil * 100),
    };

    sendSensorFrame(RELAY_ID, types, values, 3);

    Serial.print("TX RELAY_ID=");
    Serial.print(RELAY_ID);
    Serial.print(" T=");
    Serial.print(sim_temp, 2);
    Serial.print(" H=");
    Serial.print(sim_hum_air, 2);
    Serial.print(" S=");
    Serial.println(sim_hum_soil, 2);

#ifdef LED_BUILTIN
    digitalWrite(LED_BUILTIN, HIGH);
    delay(100);
    digitalWrite(LED_BUILTIN, LOW);
#endif

    delay(SEND_INTERVAL);
}
