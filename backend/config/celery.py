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
}
