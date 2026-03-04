# Deployment Guide

## Prerequisites

- Docker & Docker Compose v2
- Raspberry Pi 4 (4 GB+ RAM) for production, or any Linux/macOS host for development
- (Optional) LoRa relay hardware for real sensor data

## Development Setup

### 1. Clone and configure

```bash
git clone <repo-url> greenhouse-saas
cd greenhouse-saas
cp .env.example .env
# Edit .env with your settings (defaults work for development)
```

### 2. Start services

```bash
# Using Makefile
make up-build

# Or directly
docker compose up -d --build
```

### 3. Create initial data

```bash
# Create a superuser for Django admin
make superuser

# Or load demo data
docker compose exec backend python manage.py seed_data
```

### 4. Access the application

| URL | Service |
|-----|---------|
| http://localhost:80 | Frontend (via Nginx) |
| http://localhost:8000/admin/ | Django admin |
| http://localhost:8000/api/ | REST API |

Demo credentials (if using `seed_data`): `demo` / `demo1234`

### 5. Simulate sensor data (no hardware needed)

```bash
# Backfill 24 hours of history + live simulation
docker compose exec backend python manage.py simulate_data --backfill 24

# Just generate 50 reading cycles
docker compose exec backend python manage.py simulate_data --count 50
```

## Production Deployment

### 1. Generate SSL certificates

```bash
# Self-signed (for staging)
./scripts/generate-ssl.sh

# For Let's Encrypt, mount your certs to nginx/ssl/cert.pem and nginx/ssl/key.pem
```

### 2. Configure environment

Edit `.env` for production:

```bash
DJANGO_SECRET_KEY=<generate-a-strong-random-key>
DJANGO_DEBUG=False
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_ALLOWED_HOSTS=your-domain.com,192.168.1.100
POSTGRES_PASSWORD=<strong-password>
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

### 3. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Initialize database

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
docker compose -f docker-compose.prod.yml exec backend python manage.py seed_data
```

### 5. Verify

```bash
# Health check
curl -k https://localhost/api/health/

# Readiness check
curl -k https://localhost/api/health/ready/
```

## Production Architecture

```
                    ┌──────────┐
                    │  Client  │
                    └────┬─────┘
                         │ HTTPS (443)
                    ┌────▼─────┐
                    │  Nginx   │──── Static files (React build)
                    └────┬─────┘
              ┌──────────┼──────────┐
              │ /api/    │ /ws/     │ /admin/
         ┌────▼────┐     │    ┌────▼────┐
         │ Daphne  │◄────┘    │ Daphne  │
         │ (ASGI)  │          │  (WS)   │
         └────┬────┘          └────┬────┘
              │                    │
    ┌─────────┼─────────┬─────────┘
    │         │         │
┌───▼──┐ ┌───▼──┐ ┌────▼───┐
│Postgres│ │Redis │ │Mosquitto│
└───────┘ └──────┘ └────────┘
```

## Monitoring

### Health Endpoints

- `GET /api/health/` — Liveness probe (200 if Django is running)
- `GET /api/health/ready/` — Readiness probe (checks DB + Redis)

### Container Health

All production containers include Docker healthchecks. Monitor with:

```bash
docker compose -f docker-compose.prod.yml ps
```

### Logs

```bash
# All services
make logs

# Specific service
docker compose logs -f backend
docker compose logs -f celery-worker
docker compose logs -f mqtt-worker
```

## Connecting LoRa Hardware

1. Connect the LoRa USB adapter to the Raspberry Pi
2. Identify the serial port (usually `/dev/ttyUSB0`)
3. Update `.env`:
   ```
   LORA_SERIAL_PORT=/dev/ttyUSB0
   LORA_SERIAL_BAUDRATE=115200
   ```
4. Uncomment the `devices` section in `docker-compose.prod.yml` for the `lora-bridge` service
5. Restart: `docker compose -f docker-compose.prod.yml up -d lora-bridge`

## Backup

### Database

```bash
docker compose exec postgres pg_dump -U greenhouse greenhouse > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
cat backup.sql | docker compose exec -T postgres psql -U greenhouse greenhouse
```
