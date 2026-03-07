#include <Arduino.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ── Configuration ──────────────────────────────────────────────────────────

#define RELAY_ID          1       // Must match Zone.relay_id in Django
#define SEND_INTERVAL     10000   // ms between transmissions (10s for testing, 300s in production)
#define BAUD_RATE         115200

// Pins — adjust to your wiring
#define PIN_DHT22         4       // GPIO4 → DHT22 data
#define PIN_DS18B20       5       // GPIO5 → DS18B20 data (with 4.7kΩ pullup to 3.3V)

// Sensor type codes (mirrors protocol.py SENSOR_TYPE_MAP)
#define SENSOR_TEMP       0x01
#define SENSOR_HUM_AIR    0x02
#define SENSOR_HUM_SOIL   0x03

// Message type
#define MSG_SENSOR_DATA   0x01

// ── Sensor setup ───────────────────────────────────────────────────────────

DHT dht(PIN_DHT22, DHT22);

OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);

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
    Serial.write(buf, idx);
    Serial.flush();
}

// ── Setup & Loop ───────────────────────────────────────────────────────────

void setup() {
    Serial.begin(BAUD_RATE);
    delay(2000);  // wait for USB CDC to be ready

    dht.begin();
    ds18b20.begin();

#ifdef LED_BUILTIN
    pinMode(LED_BUILTIN, OUTPUT);
#endif
}

void loop() {
    uint8_t  types[3];
    int16_t  values[3];
    uint8_t  count = 0;

    // ── DHT22: temperature + air humidity
    float temp_air = dht.readTemperature();
    float hum_air  = dht.readHumidity();

    if (!isnan(temp_air)) {
        types[count]  = SENSOR_TEMP;
        values[count] = (int16_t)(temp_air * 100);
        count++;
    }

    if (!isnan(hum_air)) {
        types[count]  = SENSOR_HUM_AIR;
        values[count] = (int16_t)(hum_air * 100);
        count++;
    }

    // ── DS18B20: soil temperature (optional)
    ds18b20.requestTemperatures();
    float temp_soil = ds18b20.getTempCByIndex(0);

    if (temp_soil != DEVICE_DISCONNECTED_C && temp_soil != 85.0) {
        types[count]  = SENSOR_HUM_SOIL;  // reuse slot — or add SENSOR_TEMP_SOIL if needed
        values[count] = (int16_t)(temp_soil * 100);
        count++;
    }

    if (count > 0) {
        sendSensorFrame(RELAY_ID, types, values, count);
    }

    // Blink LED on send
#ifdef LED_BUILTIN
    digitalWrite(LED_BUILTIN, HIGH);
    delay(100);
    digitalWrite(LED_BUILTIN, LOW);
#endif

    delay(SEND_INTERVAL);
}
