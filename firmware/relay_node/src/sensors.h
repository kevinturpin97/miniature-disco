/**
 * @file sensors.h
 * @brief DHT22 and DS18B20 sensor abstraction layer.
 */

#pragma once

#include <stdint.h>

/**
 * @brief Aggregated sensor readings from all attached sensors.
 */
struct SensorData {
    float temperature_air;   ///< DHT22 temperature in C (NAN if error)
    float humidity_air;      ///< DHT22 relative humidity in % (NAN if error)
    float temperature_soil;  ///< DS18B20 temperature in C (NAN if error)
    bool  dht_ok;            ///< True if DHT22 read succeeded
    bool  ds18b20_ok;        ///< True if DS18B20 read succeeded
};

/**
 * @brief Initialise all configured sensors.
 *        Must be called once in setup().
 */
void sensors_init();

/**
 * @brief Read all enabled sensors and populate a SensorData struct.
 *
 * @param data Output struct to populate.
 */
void sensors_read(SensorData& data);
