# Onboarding Guide — From Hardware to First Data

This guide walks you through setting up a complete Greenhouse SaaS installation from scratch: purchasing the hardware, assembling relay nodes, deploying the Raspberry Pi edge stack, connecting to the cloud, and viewing your first sensor data.

**Target time:** < 2 hours for a single-zone setup.

---

## Prerequisites

- Basic Linux familiarity (SSH, command line)
- Docker installed on the Raspberry Pi (see step 3)
- A cloud VPS account OR access to an existing Greenhouse Cloud deployment
- A Greenhouse Cloud account (register at your cloud URL, or use the demo: `demo@greenhouse-saas.com`)

---

## Part 1 — Hardware

### 1.1 Bill of Materials (per relay node / zone)

| Component | Reference | Qty |
|-----------|-----------|-----|
| ATmega328P microcontroller board | Arduino Nano (or clone) | 1 |
| LoRa transceiver | RFM95W 868MHz | 1 |
| Temperature + air humidity sensor | DHT22 | 1 |
| Soil/water temperature sensor | DS18B20 (waterproof) | 1 |
| 4.7kΩ resistor (DS18B20 pull-up) | — | 1 |
| Power supply | 5V USB or 3.7V LiPo + boost | 1 |
| Enclosure (outdoor-rated) | IP65 junction box | 1 |
| SMA antenna 868MHz | 3dBi whip | 1 |

### 1.2 Raspberry Pi 4 (centralizer per site)

| Component | Reference |
|-----------|-----------|
| Raspberry Pi 4 Model B (2GB+) | — |
| 16GB+ MicroSD (Class 10 / A1) | — |
| LoRa HAT or USB module | RAK2287 or similar RFM95W on USB adapter |
| Ethernet cable or WiFi | — |
| Power supply (official 5.1V 3A) | — |

---

## Part 2 — Firmware (Relay Node)

### 2.1 Install PlatformIO

```bash
pip install platformio
```

### 2.2 Configure the relay

Edit `firmware/relay_node/src/config.h`:

```cpp
// Unique ID for this relay node (1–255, must match Zone.relay_id in the DB)
#define RELAY_ID 1

// LoRa frequency
#define LORA_FREQUENCY 868E6

// Sensor pins
#define DHT_PIN 4
#define ONE_WIRE_BUS 2

// Transmission interval (seconds)
#define TRANSMISSION_INTERVAL 300
```

### 2.3 Flash the firmware

```bash
cd firmware/relay_node
pio run --target upload --upload-port /dev/ttyUSB0
```

Verify output in PlatformIO serial monitor:

```
[RELAY 1] Boot OK
[SENSOR] DHT22: 22.4°C, 65.2%
[SENSOR] DS18B20: 19.8°C
[LORA] Frame sent (12 bytes), CRC OK
```

---

## Part 3 — Raspberry Pi Setup (Edge Stack)

### 3.1 Flash Raspberry Pi OS

Use Raspberry Pi Imager: **Raspberry Pi OS Lite (64-bit)**. Enable SSH in the imager settings.

### 3.2 Install Docker

```bash
ssh pi@<raspberry-ip>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker pi
newgrp docker
```

### 3.3 Deploy the edge stack

```bash
# Clone the repository
git clone https://github.com/your-org/greenhouse-saas.git
cd greenhouse-saas

# Configure environment
cp .env.example .env
nano .env
```

Minimum required `.env` values for edge mode:

```env
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(50))">
POSTGRES_DB=greenhouse
POSTGRES_USER=greenhouse
POSTGRES_PASSWORD=<strong-password>

# Edge mode ON, Cloud mode OFF
EDGE_MODE=True
VITE_EDGE_MODE=true

# Cloud sync (get these from the cloud onboarding script)
CLOUD_SYNC_URL=https://cloud.your-domain.com/api/edge/sync/
EDGE_DEVICE_ID=<provided-by-cloud>
EDGE_HMAC_KEY=<provided-by-cloud>

# Serial port of the LoRa module
LORA_SERIAL_PORT=/dev/ttyUSB0
LORA_BAUD_RATE=115200

# MQTT
MQTT_HOST=mosquitto
MQTT_PORT=1883
```

### 3.4 Start all services

```bash
make up-build
make migrate
make superuser
```

### 3.5 Verify services are running

```bash
make ps
# All 7 containers should show "Up (healthy)"
```

---

## Part 4 — Connect to the Cloud

### 4.1 Register your Raspberry Pi

On the cloud server, run the onboarding script:

```bash
# On the cloud VPS
./scripts/onboard_client.sh \
  --org "My Greenhouse Farm" \
  --email admin@mygreenhousefarm.com \
  --device-name "Raspberry Pi — Site Principal"
```

The script outputs:
```
Organization created: my-greenhouse-farm
Edge Device ID: 550e8400-e29b-41d4-a716-446655440000
HMAC Key: <64-char hex key>

Copy these values to your Raspberry Pi .env file:
  EDGE_DEVICE_ID=550e8400-e29b-41d4-a716-446655440000
  EDGE_HMAC_KEY=<64-char hex key>
  CLOUD_SYNC_URL=https://cloud.your-domain.com/api/edge/sync/
```

### 4.2 Inject credentials on the Raspberry Pi

```bash
# On the Raspberry Pi
nano .env  # paste EDGE_DEVICE_ID, EDGE_HMAC_KEY, CLOUD_SYNC_URL

# Restart backend + celery
docker compose restart backend celery-worker celery-beat
```

### 4.3 Verify sync

```bash
# Trigger a manual sync
make force-sync

# Check sync status
curl http://localhost:8000/api/sync/status/
# Expected: {"last_sync": "...", "backlog": 0, "status": "ok"}
```

---

## Part 5 — Configure Your First Zone

### 5.1 Log in to the dashboard

Open `http://<raspberry-ip>` in your browser. Log in with the superuser credentials.

### 5.2 Create your organization and greenhouse

1. Go through the **Onboarding Wizard** (shown on first login)
2. Create an organization: e.g. "My Greenhouse Farm"
3. Create a greenhouse: e.g. "Site A — Tomatoes"
4. Create a zone: relay ID **must match** `RELAY_ID` in the firmware (e.g. `1`)

### 5.3 Add sensors to the zone

In **Settings → Resources** or from the Zone detail page:
- Add **Temperature** (unit: °C, thresholds: min 10°C, max 35°C)
- Add **Air Humidity** (unit: %, thresholds: min 40%, max 90%)
- Add **Soil Temperature** (unit: °C, thresholds: min 5°C, max 30°C)

### 5.4 Add actuators (optional)

If you have relay-controlled devices:
- Add a **Water Valve** (GPIO pin: 3)
- Add a **Ventilation Fan** (GPIO pin: 5)

---

## Part 6 — First Data

### 6.1 Verify relay communication

With the relay node powered and within LoRa range:

```bash
# Watch LoRa bridge logs
make logs-bridge
```

You should see:
```
[lora-bridge] Frame received from relay 1
[lora-bridge] Decoded: TEMP=22.4, HUM_AIR=65.2, TEMP_SOIL=19.8
[lora-bridge] Published to MQTT: greenhouse/relay/1/sensors
```

### 6.2 View data on the dashboard

Navigate to your zone — you should see:
- Live sensor values in the zone header
- Charts updating in real time
- Last seen: "a few seconds ago"

### 6.3 Configure automations (optional)

Go to **Automations** and create a rule:
```
IF Air Humidity < 50% THEN Turn ON Ventilation Fan
```

With a 5-minute cooldown to prevent rapid cycling.

---

## Part 7 — Mobile Access (PWA)

On your phone, open `http://<raspberry-ip>` in Chrome or Safari.

Tap **"Add to Home Screen"** — the app installs as a PWA with:
- Offline fallback
- Push notifications for alerts
- Quick Actions page for rapid actuator control

---

## Troubleshooting

### Relay data not appearing

1. Check serial port: `ls /dev/ttyUSB*`
2. Verify `LORA_SERIAL_PORT` in `.env`
3. Check bridge logs: `make logs-bridge`
4. Verify `relay_id` in firmware matches `Zone.relay_id` in the database

### Sync not working

1. Check `CLOUD_SYNC_URL` is reachable: `curl <CLOUD_SYNC_URL>`
2. Check backlog: `curl http://localhost:8000/api/sync/status/`
3. Force retry: `docker compose exec backend python manage.py force_sync`

### Sensors not appearing in zone

1. Verify zone is created with correct `relay_id`
2. Sensors are auto-created on first reading if the zone exists
3. Check MQTT worker logs: `make logs-backend`

### Alert not triggering

1. Verify sensor `min_threshold` / `max_threshold` are set
2. Confirm Celery worker is running: `make ps`
3. Check Celery logs: `make logs-celery`

---

## Support

- Documentation: `/docs/`
- API reference: `http://<your-host>/api/docs/`
- Issues: GitHub Issues
- Cloud support: CRM operator dashboard at `/crm`
