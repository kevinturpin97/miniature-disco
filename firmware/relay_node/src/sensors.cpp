/**
 * @file sensors.cpp
 * @brief DHT22 and DS18B20 sensor reading implementation.
 */

#include "sensors.h"
#include "config.h"

#include <Arduino.h>

#if ENABLE_DHT22
#include <DHT.h>
static DHT dht(DHT_PIN, DHT_TYPE);
#endif

#if ENABLE_DS18B20
#include <DallasTemperature.h>
#include <OneWire.h>
static OneWire         one_wire(ONE_WIRE_BUS);
static DallasTemperature ds18b20(&one_wire);
#endif

void sensors_init() {
#if ENABLE_DHT22
    dht.begin();
#endif
#if ENABLE_DS18B20
    ds18b20.begin();
    ds18b20.setResolution(12);
    ds18b20.setWaitForConversion(true);
#endif
}

void sensors_read(SensorData& data) {
    // Defaults to NAN / false
    data.temperature_air  = NAN;
    data.humidity_air     = NAN;
    data.temperature_soil = NAN;
    data.dht_ok           = false;
    data.ds18b20_ok       = false;

#if ENABLE_DHT22
    data.temperature_air = dht.readTemperature();
    data.humidity_air    = dht.readHumidity();
    data.dht_ok = !(isnan(data.temperature_air) || isnan(data.humidity_air));
    if (!data.dht_ok) {
        Serial.println(F("[SENSOR] DHT22 read failed"));
    }
#endif

#if ENABLE_DS18B20
    ds18b20.requestTemperatures();
    data.temperature_soil = ds18b20.getTempCByIndex(0);
    data.ds18b20_ok = (data.temperature_soil != DEVICE_DISCONNECTED_C);
    if (!data.ds18b20_ok) {
        data.temperature_soil = NAN;
        Serial.println(F("[SENSOR] DS18B20 read failed"));
    }
#endif
}
