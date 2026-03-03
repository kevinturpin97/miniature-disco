# Greenhouse SaaS

Automated greenhouse control platform with LoRa-connected sensor relays, real-time monitoring, and rule-based automation.

## Architecture

```
Sensors (pH, Temp, Humidity, etc.)
    |
LoRa Relay Nodes (ATmega328P + RFM95W)
    |  LoRa 868MHz
    v
Raspberry Pi 4 (Centralizer)
    ├── lora-bridge (Python) --> Mosquitto (MQTT)
    ├── backend (Django 5 + DRF + Channels) <--> PostgreSQL + Redis
    ├── celery (workers + beat)
    └── frontend (React 18 + Vite) served by Nginx
```

## Prerequisites

- Docker & Docker Compose
- Git

## Quick Start

1. **Clone the repository**

```bash
git clone <repo-url>
cd greenhouse-saas
```

2. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your values (defaults work for development)
```

3. **Start all services**

```bash
make up-build
```

4. **Run migrations**

```bash
make migrate
```

5. **Create a superuser**

```bash
make superuser
```

6. **Access the application**

- Frontend: http://localhost (via Nginx) or http://localhost:5173 (Vite dev server)
- Backend API: http://localhost:8000/api/
- Django Admin: http://localhost:8000/admin/
- MQTT Broker: localhost:1883

## Available Make Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make up-build` | Build and start all services |
| `make down` | Stop all services |
| `make down-v` | Stop all services and remove volumes |
| `make logs` | Show logs for all services |
| `make logs-backend` | Show backend logs |
| `make migrate` | Run Django migrations |
| `make makemigrations` | Create new migrations |
| `make shell` | Open Django shell |
| `make superuser` | Create a Django superuser |
| `make test` | Run all tests |
| `make test-backend` | Run backend tests |
| `make test-frontend` | Run frontend tests |
| `make db-shell` | Open PostgreSQL shell |
| `make ps` | Show running containers |

## Tech Stack

### Backend
- Python 3.12, Django 5.1, Django REST Framework 3.15
- Django Channels 4.1 (WebSocket)
- Celery 5.4 (async tasks)
- PostgreSQL 16, Redis 7

### Frontend
- React 18.3, TypeScript 5.5, Vite 5.4
- TailwindCSS 3.4, Recharts 2.12
- Zustand 4.5 (state management)
- Zod 3.23 (validation)

### IoT
- LoRa 868MHz (RFM95W modules)
- MQTT (Eclipse Mosquitto 2)
- Custom binary protocol with CRC8

## Project Structure

```
greenhouse-saas/
├── backend/          # Django API + Channels + Celery
├── frontend/         # React + Vite + TailwindCSS
├── lora-bridge/      # Python LoRa-to-MQTT bridge
├── firmware/         # PlatformIO relay node firmware
├── mosquitto/        # MQTT broker config
├── nginx/            # Reverse proxy config
└── docs/             # Documentation
```

## Development

### Backend

```bash
# Run backend tests
make test-backend

# Open Django shell
make shell

# View backend logs
make logs-backend
```

### Frontend

```bash
# Run frontend tests
make test-frontend

# Lint
make lint

# Format
make format
```
