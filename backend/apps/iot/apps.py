"""IoT app configuration."""

from django.apps import AppConfig


class IotConfig(AppConfig):
    """Configuration for the IoT application."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.iot"
    verbose_name = "IoT"
