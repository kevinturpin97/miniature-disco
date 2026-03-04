# Architecture

## System Overview

The Greenhouse SaaS platform is a full-stack IoT solution for automated greenhouse control. It collects sensor data from distributed relay nodes via LoRa, processes it in real-time, and provides a web dashboard for monitoring and control.

```
Sensors (pH, T°, H%, etc.)
    │
    ▼
LoRa Relay Nodes (ATmega328P + RFM95W) × N zones
    │  LoRa 868MHz
    ▼
Raspberry Pi 4 (Centraliseur)
    ├── lora-bridge (Python) ──► Mosquitto (MQTT)
    ├── backend (Django 5 + DRF + Channels) ◄──► PostgreSQL + Redis
    ├── celery (workers + beat)
    └── frontend (React 18 + Vite) served by Nginx
```

## Services

| Service | Technology | Role |
|---------|-----------|------|
| **backend** | Django 5 + DRF + Channels | REST API, WebSocket, admin |
| **celery-worker** | Celery 5.4 | Async task execution (alerts, automations, commands) |
| **celery-beat** | Celery Beat | Periodic tasks (offline detection, command timeouts) |
| **mqtt-worker** | Django management command | MQTT subscriber → database ingestion |
| **lora-bridge** | Python + pyserial | Serial ↔ MQTT bridge for LoRa relay nodes |
| **frontend** | React 18 + Vite + TailwindCSS | SPA dashboard |
| **nginx** | Nginx | Reverse proxy, HTTPS termination, static files |
| **postgres** | PostgreSQL 16 | Primary database |
| **redis** | Redis 7 | Channel layer, Celery broker, caching |
| **mosquitto** | Eclipse Mosquitto 2 | MQTT broker |

## Data Flow

### Sensor Data Ingestion
1. Relay node reads sensors and encodes a binary LoRa frame
2. LoRa Bridge receives the frame via serial, decodes and validates CRC8
3. Bridge publishes JSON to MQTT topic `greenhouse/relay/{relay_id}/sensors`
4. MQTT Worker subscribes, parses the message, and creates `SensorReading` records
5. Django `post_save` signal triggers:
   - Threshold evaluation → Alert creation
   - Automation rule evaluation → Command creation
6. WebSocket push to connected clients via Django Channels

### Command Pipeline
1. User clicks ON/OFF in the frontend
2. Frontend calls `POST /api/actuators/{id}/commands/`
3. Django creates a `Command` (status=PENDING)
4. `post_save` signal dispatches `send_command_to_mqtt` Celery task
5. Task publishes to MQTT topic `greenhouse/commands/{relay_id}`
6. LoRa Bridge sends the command via serial/LoRa to the relay node
7. Relay executes the command and sends an ACK via LoRa
8. Bridge publishes ACK to MQTT `greenhouse/relay/{relay_id}/ack`
9. MQTT Worker processes ACK → updates Command status to ACK
10. WebSocket pushes status update to the frontend

## Database Schema

### Core Models
- **Greenhouse** — top-level resource owned by a user
- **Zone** — a physical area within a greenhouse, linked to a relay node
- **Sensor** — sensor attached to a zone (TEMP, HUM_AIR, HUM_SOIL, PH, LIGHT, CO2)
- **SensorReading** — individual timestamped sensor values
- **Actuator** — controllable device (VALVE, FAN, HEATER, LIGHT, PUMP, SHADE)
- **Command** — action sent to an actuator with status tracking
- **AutomationRule** — IF sensor condition THEN actuator action
- **Alert** — threshold breaches, offline relays, command failures

### Ownership Chain
```
User → Greenhouse → Zone → Sensor/Actuator/AutomationRule/Alert
                          → SensorReading (via Sensor)
                          → Command (via Actuator)
```

All API access is filtered through this chain — users can only see their own data.

## Security

- JWT authentication (access + refresh tokens)
- Token rotation with blacklisting
- Rate limiting (DRF throttle classes)
- Nginx rate limiting on auth endpoints
- CORS restricted to configured origins
- CSRF protection enabled
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- Input validation at every layer (Zod frontend, DRF serializers, Django model validators)
