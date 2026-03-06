"""
Celery configuration for Greenhouse SaaS.
"""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("greenhouse")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Beat schedule — periodic tasks
app.conf.beat_schedule = {
    "detect-offline-relays": {
        "task": "iot.detect_offline_relays",
        "schedule": 60.0,  # Every 60 seconds
    },
    "timeout-pending-commands": {
        "task": "iot.timeout_pending_commands",
        "schedule": 30.0,  # Every 30 seconds
    },
    "daily-alert-digest": {
        "task": "iot.send_daily_digest",
        "schedule": crontab(hour=8, minute=0),  # Every day at 08:00 UTC
    },
    "aggregate-hourly-readings": {
        "task": "iot.aggregate_hourly_readings",
        "schedule": crontab(minute=5),  # Every hour at :05
    },
    "check-schedules": {
        "task": "iot.check_schedules",
        "schedule": 60.0,  # Every 60 seconds
    },
    # Sprint 20 — AI & ML tasks
    "train-ml-models": {
        "task": "iot.train_ml_models",
        "schedule": crontab(hour=2, minute=0),  # Daily at 02:00 UTC
    },
    "generate-predictions": {
        "task": "iot.generate_all_predictions",
        "schedule": crontab(hour="*/4", minute=15),  # Every 4 hours at :15
    },
    "generate-smart-suggestions": {
        "task": "iot.generate_smart_suggestions_task",
        "schedule": crontab(hour=3, minute=0, day_of_week=1),  # Weekly Monday 03:00 UTC
    },
    "generate-weekly-ai-reports": {
        "task": "iot.generate_weekly_ai_reports",
        "schedule": crontab(hour=7, minute=0, day_of_week=1),  # Weekly Monday 07:00 UTC
    },
    # Sprint 22 — Billing & Trial management
    "check-trial-expiry": {
        "task": "api.check_trial_expiry",
        "schedule": crontab(hour=9, minute=0),  # Daily at 09:00 UTC
    },
    # Sprint 23 — Data Pipeline & Long-Term History
    "aggregate-daily-readings": {
        "task": "iot.aggregate_daily_readings",
        "schedule": crontab(hour=0, minute=30),  # Daily at 00:30 UTC
    },
    "enforce-retention-policies": {
        "task": "iot.enforce_retention_policies",
        "schedule": crontab(hour=1, minute=0),  # Daily at 01:00 UTC
    },
    "archive-cold-storage": {
        "task": "iot.archive_cold_storage",
        "schedule": crontab(hour=0, minute=45),  # Daily at 00:45 UTC (before retention)
    },
    "ensure-partitions": {
        "task": "iot.ensure_partitions",
        "schedule": crontab(hour=0, minute=0),  # Daily at midnight
    },
    "drop-old-partitions": {
        "task": "iot.drop_old_partitions",
        "schedule": crontab(hour=4, minute=0, day_of_month=1),  # Monthly on 1st at 04:00
    },
    # Sprint 27 — Edge Sync Agent
    "sync-to-cloud": {
        "task": "iot.sync_to_cloud",
        "schedule": 300.0,  # Every 5 minutes
    },
    "bulk-sync-to-cloud": {
        "task": "iot.bulk_sync_to_cloud",
        "schedule": crontab(hour=2, minute=0),  # Nightly at 02:00 UTC
    },
    "retry-failed-syncs": {
        "task": "iot.retry_failed_syncs",
        "schedule": 60.0,  # Every 60 seconds to pick up due retries
    },
    # Sprint 31 — Crop Intelligence
    "calculate-crop-status": {
        "task": "iot.calculate_crop_status",
        "schedule": 900.0,  # Every 15 minutes
    },
}
