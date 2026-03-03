"""
Celery configuration for Greenhouse SaaS.
"""

import os

from celery import Celery

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
}
