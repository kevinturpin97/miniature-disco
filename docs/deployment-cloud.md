# Cloud Deployment Guide

This guide covers deploying the **Greenhouse SaaS Cloud CRM Platform** on a VPS.
The cloud deployment receives sync batches from multiple edge Raspberry Pi devices
and provides a CRM dashboard for operators to manage all client tenants.

## Architecture

```
Edge (Raspberry Pi)                    Cloud (VPS)
──────────────────                     ────────────────────────────────────
  Sensors → LoRa bridge                  Nginx (HTTPS, Let's Encrypt)
  Django (Edge mode)                     Django (Cloud mode)
  Celery sync_to_cloud ─── HTTPS ──►    /api/edge/sync/  ← HMAC auth
  MQTT (local)                           Celery sync_ingest worker
  PostgreSQL (30-day raw)                PostgreSQL (90-day raw)
                                         Redis
                                         CRM dashboard (/crm)
```

## Prerequisites

- VPS with at least 2 GB RAM, 20 GB disk (Ubuntu 22.04+ recommended)
- Docker + Docker Compose v2 installed
- A domain name pointing to the VPS IP (e.g. `cloud.your-domain.com`)
- Ports 80 and 443 open

## Quick Start (< 30 minutes)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/greenhouse-saas.git
cd greenhouse-saas
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
# Django
DJANGO_SETTINGS_MODULE=config.settings.cloud
DJANGO_SECRET_KEY=<generate with: python3 -c "import secrets; print(secrets.token_hex(32))">
DJANGO_ALLOWED_HOSTS=cloud.your-domain.com,localhost

# Database
POSTGRES_DB=greenhouse
POSTGRES_USER=greenhouse
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://greenhouse:<password>@postgres:5432/greenhouse

# Redis
REDIS_URL=redis://redis:6379/0

# Email (for notifications)
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_HOST_USER=noreply@your-domain.com
EMAIL_HOST_PASSWORD=<password>

# App mode flags
EDGE_MODE=False
CLOUD_MODE=True
VITE_EDGE_MODE=false
```

### 3. Build and start services

```bash
docker compose -f docker-compose.cloud.yml build
docker compose -f docker-compose.cloud.yml up -d
```

Wait for health checks to pass:
```bash
docker compose -f docker-compose.cloud.yml ps
```

### 4. Run migrations and create superuser

```bash
docker compose -f docker-compose.cloud.yml exec backend \
  python manage.py migrate

docker compose -f docker-compose.cloud.yml exec backend \
  python manage.py createsuperuser
```

### 5. Configure HTTPS with Let's Encrypt

Create a temporary Nginx config for the ACME challenge (HTTP only):

```bash
# nginx/nginx.cloud.conf must serve /.well-known/acme-challenge/ on port 80
docker compose -f docker-compose.cloud.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email admin@your-domain.com \
  --agree-tos \
  -d cloud.your-domain.com
```

Then update `nginx/nginx.cloud.conf` to include the SSL certificates and restart:

```bash
docker compose -f docker-compose.cloud.yml restart nginx
```

Certificates auto-renew via the certbot container.

### 6. Verify

```bash
curl https://cloud.your-domain.com/api/health/
# → {"status": "ok", ...}
```

## Onboarding a New Edge Client

Use the provided script on the client's Raspberry Pi:

```bash
export CLOUD_URL="https://cloud.your-domain.com"
export ADMIN_TOKEN="<JWT from login>"
export ORG_SLUG="client-farm-slug"
export DEVICE_NAME="Raspberry Pi Main Site"
bash scripts/onboard_client.sh
```

Or manually:

1. **Register the device** via the API:
```bash
curl -X POST https://cloud.your-domain.com/api/edge/register/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_slug": "my-org", "name": "Raspberry Pi Site Nord"}'
# Returns: {"device_id": "uuid", "secret_key": "hex", ...}
```

2. **Configure the edge device** — add to `.env` on the Raspberry Pi:
```env
EDGE_MODE=True
EDGE_DEVICE_ID=<device_id from step 1>
EDGE_SECRET_KEY=<secret_key from step 1>
CLOUD_SYNC_URL=https://cloud.your-domain.com
```

3. The edge device will automatically sync every 5 minutes.

## CRM Dashboard

Access the CRM at `https://cloud.your-domain.com/crm` (Django staff users only).

Features:
- **Tenant list** — all client organizations with health indicators
- **Tenant detail** — greenhouses, zones, devices, sync history, alerts
- **Health snapshot** — device online status, backlog, failed batches
- **Impersonate** — issue a 30-min token to access a client's dashboard
- **CSV export** — download the full tenant list

To grant CRM access to a user:
```bash
docker compose -f docker-compose.cloud.yml exec backend \
  python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.get(username='operator')
u.is_staff = True
u.save()
"
```

## Backup

Automatic daily PostgreSQL backups via the `pg-backup` service.
Configure S3 upload in `.env`:
```env
CLOUD_BACKUP_S3_BUCKET=my-backup-bucket
BACKUP_RETENTION_DAYS=30
```

Manual backup:
```bash
docker compose -f docker-compose.cloud.yml exec postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup_$(date +%Y%m%d).sql.gz
```

## Data Retention

Cloud retains data longer than edge:

| Data type       | Edge  | Cloud      |
|-----------------|-------|------------|
| Raw readings    | 30d   | 90d        |
| Hourly agg.     | 1y    | 2y         |
| Daily agg.      | ∞     | ∞          |

## Scaling

For high load (> 50 clients, > 10 000 readings/min):

1. Scale the sync ingestion worker:
```bash
docker compose -f docker-compose.cloud.yml up -d --scale sync-worker=4
```

2. Consider TimescaleDB for `SensorReading` — see `docs/architecture.md`.

## Troubleshooting

```bash
# View logs
docker compose -f docker-compose.cloud.yml logs -f backend
docker compose -f docker-compose.cloud.yml logs -f sync-worker

# Check sync queue depth
docker compose -f docker-compose.cloud.yml exec redis \
  redis-cli llen celery

# Force migration
docker compose -f docker-compose.cloud.yml exec backend \
  python manage.py migrate --run-syncdb
```

## Security Checklist

- [ ] `DJANGO_SECRET_KEY` is unique and random (32+ bytes)
- [ ] `POSTGRES_PASSWORD` is strong (16+ chars)
- [ ] Django `DEBUG=False` in production
- [ ] HTTPS enforced (Let's Encrypt certificate)
- [ ] HSTS enabled in Nginx config
- [ ] Certbot renewal cron active
- [ ] Staff access limited to operators only
- [ ] Backups configured and tested
