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

## Deployment Modes

The platform supports two deployment modes controlled via environment variables.

### Edge Mode (`EDGE_MODE=True`)

Deployed on a Raspberry Pi 4 at the physical site. Full local stack with LoRa bridge.

```
Sensors (pH, T°, H%, etc.)
    │
    ▼
LoRa Relay Nodes (ATmega328P + RFM95W) × N zones
    │  LoRa 868MHz
    ▼
Raspberry Pi 4 (Edge Node)
    ├── lora-bridge (Python) ──► Mosquitto (MQTT)
    ├── backend (Django 5) ◄──► PostgreSQL + Redis
    ├── celery (workers + beat)
    │       ↕ HTTPS + HMAC
    └── sync_to_cloud task ──► Cloud VPS
```

**Active features in Edge mode:**
- LoRa Bridge management (serial port, MQTT)
- Local MQTT monitoring
- Store-and-forward sync with exponential retry
- All IoT features (sensors, actuators, automations, alerts)

**Hidden in Edge mode:**
- CRM dashboard (`/crm`)
- Tenant management
- Multi-site operator view

### Cloud Mode (`EDGE_MODE=False`, `CLOUD_MODE=True`)

Deployed on a VPS. Receives synced data from multiple edge sites. No LoRa bridge.

```
Edge Site A (Raspberry Pi)
    │  HTTPS + HMAC batches
Edge Site B (Raspberry Pi) ──► Cloud VPS (Django Cloud)
    │                               ├── /api/edge/sync/ (ingestion)
Edge Site C (Raspberry Pi)         ├── /api/crm/ (operator dashboard)
                                    ├── PostgreSQL + Redis
                                    └── Nginx (HTTPS + Let's Encrypt)
```

**Active features in Cloud mode:**
- CRM dashboard with all client tenants
- Multi-site Leaflet map
- Impersonation tool (30-minute operator tokens)
- Global analytics and metrics
- SyncBatch processing and deduplication
- Client plan management

**Hidden in Cloud mode:**
- LoRa Bridge settings
- Local MQTT configuration

### Feature Gate System

```typescript
// Frontend: useAppMode() hook
const { isEdgeMode, isCloudMode, features } = useAppMode();

// Conditional rendering
<FeatureGate feature="crm">
  <CRMDashboard />
</FeatureGate>

<FeatureGate feature="loraBridge">
  <LoRaBridgeSettings />
</FeatureGate>
```

Available feature flags:
| Flag | Edge | Cloud |
|------|------|-------|
| `loraBridge` | ✅ | ❌ |
| `mqtt` | ✅ | ❌ |
| `crm` | ❌ | ✅ |
| `sync` | ✅ | ✅ |
| `multiTenant` | ✅ | ✅ |
| `billing` | ✅ | ✅ |

---

## Edge Sync Protocol

### Authentication

Every request from an edge device to the cloud uses HMAC-SHA256:

```
X-Device-ID: <edge device UUID>
X-Timestamp: <unix timestamp>
X-Signature: HMAC-SHA256(secret_key, f"{device_id}:{timestamp}:{body_hash}")
```

Requests older than 5 minutes are rejected to prevent replay attacks.

### Sync Payload (gzip compressed)

```json
{
  "device_id": "550e8400-...",
  "batch_id": "uuid",
  "readings": [...],
  "commands": [...],
  "alerts": [...],
  "audit_events": [...]
}
```

### Conflict Resolution

- **Readings:** Edge wins — cloud never overwrites sensor data received from edge
- **Configs:** Cloud wins — automation rules, schedules, thresholds pushed from cloud override edge
- **Commands:** Bidirectional — cloud-initiated commands queued as PENDING on edge

---

## Multi-Tenancy

```
Organization (slug, plan: FREE/PRO/ENTERPRISE)
    │
    ├── Membership (user, role: OWNER/ADMIN/OPERATOR/VIEWER)
    ├── Greenhouse (1..N based on plan quota)
    │       └── Zone → Sensor/Actuator/AutomationRule/Alert
    ├── NotificationChannel (EMAIL/WEBHOOK/TELEGRAM/PUSH)
    ├── APIKey (scoped: read/write/admin)
    ├── Subscription (Stripe)
    └── CloudTenant (cloud-side: edge_devices, storage_mb)
```

Plan quotas (enforced via Django middleware):
| Plan | Greenhouses | Zones | Members | API calls/day |
|------|------------|-------|---------|---------------|
| FREE | 3 | 10 | 3 | 1,000 |
| PRO | 20 | 100 | 20 | 50,000 |
| ENTERPRISE | Unlimited | Unlimited | Unlimited | Unlimited |

---

## Security

- JWT authentication (access + refresh tokens, token blacklisting)
- API Key authentication (X-API-Key header, long-lived, scoped)
- HMAC-SHA256 edge-to-cloud authentication (replay-protected)
- Rate limiting: DRF throttle classes per-user + per-IP, Nginx rate limiting on auth endpoints
- CORS restricted to configured origins
- CSRF protection enabled
- Security headers: HSTS (max-age=31536000, includeSubDomains), X-Frame-Options DENY, X-Content-Type-Options nosniff, Content-Security-Policy
- Input validation at every layer (Zod frontend, DRF serializers, Django model validators)
- Audit log: AuditEvent model (user, action, resource, timestamp, IP)
- Sentry error tracking (backend + frontend, source maps)
- Prometheus metrics: readings/min, commands/min, sync batch sizes
