# Greenhouse SaaS

[![CI](https://github.com/your-org/greenhouse-saas/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/greenhouse-saas/actions/workflows/ci.yml)
[![Deploy](https://github.com/your-org/greenhouse-saas/actions/workflows/deploy.yml/badge.svg)](https://github.com/your-org/greenhouse-saas/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Full-stack IoT SaaS platform for automated greenhouse control. LoRa-connected sensor relay nodes, real-time monitoring, rule-based automation, multi-tenant cloud CRM, and AI predictions.

**Live demo:** [https://demo.greenhouse-saas.com](https://demo.greenhouse-saas.com)
**Demo credentials:** `demo@greenhouse-saas.com` / `demo1234` (read-only)

> **Deployment modes:** Edge (Raspberry Pi, on-site LoRa) or Cloud (VPS, multi-tenant CRM) — feature-gated UI adapts automatically.

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

## Quick Demo

```bash
make demo
# Starts all services, seeds 6 months of data, opens http://localhost in your browser
# Demo account: demo@greenhouse-saas.com / demo1234 (read-only)
```

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
| `make seed` | Load demo seed data |
| `make demo` | Full demo: seed 6 months of data + open browser |
| `make simulate` | Simulate live sensor data (Ctrl+C to stop) |
| `make health` | Check all health endpoints |
| `make loadtest` | Run Locust load test (opens :8089) |
| `make backup` | Trigger PostgreSQL backup manually |

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
├── .github/workflows/    # CI/CD (ci.yml + deploy.yml)
├── backend/              # Django API + Channels + Celery
├── frontend/             # React + Vite + TailwindCSS
│   └── e2e/              # Playwright E2E tests
├── lora-bridge/          # Python LoRa-to-MQTT bridge
├── firmware/             # PlatformIO relay node firmware
├── mosquitto/            # MQTT broker config
├── nginx/                # Reverse proxy config
├── scripts/              # Utility scripts (onboard, backup, SSL)
├── locustfile.py         # Load tests (Locust)
└── docs/
    ├── architecture.md   # System architecture + Edge/Cloud modes
    ├── deployment.md     # Edge deployment guide (Raspberry Pi)
    ├── deployment-cloud.md # Cloud deployment guide (VPS)
    ├── onboarding.md     # First client guide (hardware to first data)
    ├── roadmap.md        # Full product roadmap (sprints 1–29)
    ├── api.md            # API reference
    └── protocol.md       # LoRa binary protocol specification
```

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](docs/architecture.md) | System design, Edge/Cloud modes, feature flags |
| [Edge Deployment](docs/deployment.md) | Deploy on Raspberry Pi (< 1h) |
| [Cloud Deployment](docs/deployment-cloud.md) | Deploy on VPS (< 30min) |
| [Onboarding](docs/onboarding.md) | First client guide (hardware to first data) |
| [API Reference](docs/api.md) | REST API endpoints |
| [LoRa Protocol](docs/protocol.md) | Binary frame format + CRC8 |
| [Roadmap](docs/roadmap.md) | Product roadmap (sprints 1–29) |

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
