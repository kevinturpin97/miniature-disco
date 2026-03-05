"""
Cloud settings for Greenhouse SaaS — Cloud CRM Platform.

Inherits from production settings but disables edge-specific features
and enables cloud-only features (CRM, multi-tenant ingestion, etc.).

Usage:
    DJANGO_SETTINGS_MODULE=config.settings.cloud
"""

from .production import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Cloud mode flags
# ---------------------------------------------------------------------------

EDGE_MODE = False
CLOUD_MODE = True

# ---------------------------------------------------------------------------
# Cloud-specific feature flags
# ---------------------------------------------------------------------------

# Features available only in Cloud mode
CLOUD_FEATURES = {
    "crm": True,            # CRM dashboard for operators
    "impersonate": True,    # Support impersonation of client orgs
    "multi_sync": True,     # Receive sync batches from multiple edge devices
}

# ---------------------------------------------------------------------------
# Sync ingestion settings
# ---------------------------------------------------------------------------

# Max records per batch accepted from edge devices
CLOUD_SYNC_INGEST_BATCH_MAX = 5000

# Celery queue for sync ingestion (dedicated worker in cloud)
CLOUD_SYNC_INGEST_QUEUE = "sync_ingest"

# Retention — cloud keeps raw data longer than edge
CLOUD_RAW_RETENTION_DAYS = 90
CLOUD_HOURLY_RETENTION_DAYS = 365 * 2  # 2 years
CLOUD_DAILY_RETENTION_DAYS = 0          # forever

# ---------------------------------------------------------------------------
# Cloud backup settings (overrides production defaults if set)
# ---------------------------------------------------------------------------

from decouple import config  # noqa: E402

CLOUD_BACKUP_S3_BUCKET = config("CLOUD_BACKUP_S3_BUCKET", default="")
CLOUD_BACKUP_S3_PREFIX = config("CLOUD_BACKUP_S3_PREFIX", default="backups/")
CLOUD_BACKUP_RETENTION_DAYS = config("CLOUD_BACKUP_RETENTION_DAYS", default=30, cast=int)

# ---------------------------------------------------------------------------
# MQTT disabled in cloud — no local broker needed
# ---------------------------------------------------------------------------

MQTT_ENABLED = False
