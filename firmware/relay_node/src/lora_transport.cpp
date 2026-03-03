/**
 * @file lora_transport.cpp
 * @brief LoRa hardware transport using sandeepmistry/LoRa library.
 */

#include "lora_transport.h"
#include "config.h"

#include <Arduino.h>
#include <LoRa.h>

void lora_init() {
    LoRa.setPins(LORA_SS_PIN, LORA_RST_PIN, LORA_DIO0_PIN);

    if (!LoRa.begin(static_cast<long>(LORA_FREQUENCY))) {
        Serial.println(F("[LORA] Init FAILED — halting"));
        while (true) {
            delay(1000);
        }
    }

    LoRa.setTxPower(LORA_TX_POWER);
    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(static_cast<long>(LORA_BW));
    LoRa.enableCrc();

    Serial.println(F("[LORA] Init OK"));
}

void lora_sleep() {
    LoRa.sleep();
}

bool lora_send(const LoRaFrame& frame) {
    if (!LoRa.beginPacket()) {
        Serial.println(F("[LORA] beginPacket failed"));
        return false;
    }

    LoRa.write(frame.buf, frame.len);

    if (!LoRa.endPacket()) {
        Serial.println(F("[LORA] endPacket failed"));
        return false;
    }

    Serial.print(F("[LORA] TX "));
    Serial.print(frame.len);
    Serial.println(F(" bytes"));
    return true;
}

bool lora_receive_command(uint8_t relay_id,
                          LoRaCommand& out,
                          uint16_t timeout_ms) {
    unsigned long start = millis();

    while ((millis() - start) < timeout_ms) {
        int packet_size = LoRa.parsePacket();
        if (packet_size == 0) {
            continue;
        }

        // Read raw bytes
        uint8_t buf[MAX_FRAME_SIZE];
        uint8_t idx = 0;
        while (LoRa.available() && idx < MAX_FRAME_SIZE) {
            buf[idx++] = static_cast<uint8_t>(LoRa.read());
        }

        out = decode_command(buf, idx);

        if (!out.valid) {
            Serial.println(F("[LORA] RX bad CRC — dropped"));
            continue;
        }

        // Ignore commands addressed to other relays
        if (out.relay_id != relay_id) {
            continue;
        }

        Serial.print(F("[LORA] RX cmd pin="));
        Serial.print(out.actuator_pin);
        Serial.print(F(" action="));
        Serial.println(out.action);
        return true;
    }

    return false;
}
