# LoRa Binary Protocol

## Overview

The LoRa protocol uses compact binary frames to minimize airtime. All multi-byte values are little-endian. Each frame includes a CRC8 checksum for integrity validation.

## Frame Types

### Sensor Data (Relay → Centraliseur) — MSG_TYPE 0x01

```
┌──────────┬──────────┬────────────┬────────────────────────────┬──────┐
│ RELAY_ID │ MSG_TYPE │ SENSOR_CNT │ [TYPE(1B) VALUE(2B)] × N   │ CRC8 │
│ uint8    │ 0x01     │ uint8      │ N × 3 bytes                │ uint8│
└──────────┴──────────┴────────────┴────────────────────────────┴──────┘
```

| Field | Size | Description |
|-------|------|-------------|
| RELAY_ID | 1 byte | Unique relay node identifier (1–255) |
| MSG_TYPE | 1 byte | Always `0x01` for sensor data |
| SENSOR_CNT | 1 byte | Number of sensor readings in this frame |
| TYPE | 1 byte | Sensor type code (see table below) |
| VALUE | 2 bytes | Signed int16, real value × 100 |
| CRC8 | 1 byte | CRC-8/MAXIM over all preceding bytes |

### Command (Centraliseur → Relay) — MSG_TYPE 0x80

```
┌──────────┬──────────┬──────────────┬─────────┬──────┐
│ RELAY_ID │ MSG_TYPE │ ACTUATOR_PIN │ ACTION  │ CRC8 │
│ uint8    │ 0x80     │ uint8        │ uint8   │ uint8│
└──────────┴──────────┴──────────────┴─────────┴──────┘
```

For `SET_VALUE` actions, an additional 2-byte value follows ACTION:

```
┌──────────┬──────────┬──────────────┬─────────┬─────────┬──────┐
│ RELAY_ID │ MSG_TYPE │ ACTUATOR_PIN │ ACTION  │ VALUE   │ CRC8 │
│ uint8    │ 0x80     │ uint8        │ 0x02    │ int16   │ uint8│
└──────────┴──────────┴──────────────┴─────────┴─────────┴──────┘
```

## Value Encoding

All sensor values are transmitted as signed 16-bit integers with a multiplication factor of 100:

| Real Value | Encoded Value |
|-----------|---------------|
| Temperature 23.45°C | 2345 |
| pH 6.82 | 682 |
| Humidity 67.5% | 6750 |
| Light 15000 lux | Overflow — use raw value |
| CO2 800 ppm | Overflow — use raw value |

For LIGHT and CO2 sensors, the value is transmitted as raw integer (no × 100).

## Sensor Type Codes

| Code | Type | Unit |
|------|------|------|
| 0x01 | TEMP | °C |
| 0x02 | HUM_AIR | % |
| 0x03 | HUM_SOIL | % |
| 0x04 | PH | — |
| 0x05 | LIGHT | lux |
| 0x06 | CO2 | ppm |

## Action Codes

| Code | Action | Description |
|------|--------|-------------|
| 0x00 | OFF | Turn actuator off |
| 0x01 | ON | Turn actuator on |
| 0x02 | SET_VALUE | Set to specific value (followed by 2-byte int16) |

## CRC-8/MAXIM

- Polynomial: `0x31` (x⁸ + x⁵ + x⁴ + 1)
- Init: `0x00`
- Computed over all bytes preceding the CRC field

## MQTT Bridge Format

The LoRa Bridge converts binary frames to JSON for MQTT transport:

### Sensor Data Topic: `greenhouse/relay/{relay_id}/sensors`
```json
{
  "relay_id": 1,
  "readings": [
    {"sensor_type": "TEMP", "value": 23.45},
    {"sensor_type": "HUM_AIR", "value": 67.5}
  ]
}
```

### Command Topic: `greenhouse/commands/{relay_id}`
```json
{
  "command_id": 42,
  "actuator_pin": 4,
  "action": 1,
  "value": 0
}
```

### Command ACK Topic: `greenhouse/relay/{relay_id}/ack`
```json
{
  "command_id": 42,
  "status": "ACK"
}
```
