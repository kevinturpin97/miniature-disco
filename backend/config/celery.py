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
}
