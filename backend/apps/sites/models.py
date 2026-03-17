"""Sites app models — Site, WeatherData, WeatherAlert."""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.organizations.models import Organization


class Site(models.Model):
    """Represents a physical geographic site that can host multiple greenhouses."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="sites",
    )
    name = models.CharField(max_length=150)
    address = models.CharField(max_length=500, blank=True)
    latitude = models.FloatField(
        validators=[MinValueValidator(-90.0), MaxValueValidator(90.0)],
    )
    longitude = models.FloatField(
        validators=[MinValueValidator(-180.0), MaxValueValidator(180.0)],
    )
    timezone = models.CharField(
        max_length=50,
        default="UTC",
        help_text="IANA timezone identifier (e.g. Europe/Paris)",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        db_table = "iot_site"

    def __str__(self) -> str:
        return f"{self.name} ({self.latitude:.4f}, {self.longitude:.4f})"


class WeatherData(models.Model):
    """Stores weather snapshots fetched from Open-Meteo for a Site."""

    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name="weather_data",
    )
    timestamp = models.DateTimeField(help_text="Time of the weather observation")
    temperature = models.FloatField(
        null=True, blank=True, help_text="External temperature in °C",
    )
    humidity = models.FloatField(
        null=True, blank=True, help_text="Relative humidity in %",
    )
    precipitation = models.FloatField(
        null=True, blank=True, help_text="Precipitation in mm",
    )
    wind_speed = models.FloatField(
        null=True, blank=True, help_text="Wind speed in km/h",
    )
    uv_index = models.FloatField(
        null=True, blank=True, help_text="UV index",
    )
    cloud_cover = models.FloatField(
        null=True, blank=True, help_text="Cloud cover in %",
    )
    weather_code = models.IntegerField(
        null=True, blank=True,
        help_text="WMO weather interpretation code",
    )
    is_forecast = models.BooleanField(
        default=False,
        help_text="True if this is a forecast, False if historical/current",
    )
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["site", "-timestamp"]),
            models.Index(fields=["site", "is_forecast", "-timestamp"]),
        ]
        db_table = "iot_weatherdata"

    def __str__(self) -> str:
        kind = "forecast" if self.is_forecast else "current"
        return f"Weather({self.site.name} {kind} @ {self.timestamp})"


class WeatherAlert(models.Model):
    """Geo-contextual weather alerts generated from forecast analysis."""

    class AlertLevel(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    site = models.ForeignKey(
        Site,
        on_delete=models.CASCADE,
        related_name="weather_alerts",
    )
    alert_level = models.CharField(
        max_length=10, choices=AlertLevel.choices, default=AlertLevel.WARNING,
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    forecast_date = models.DateField(help_text="Date of the forecasted event")
    is_acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "iot_weatheralert"

    def __str__(self) -> str:
        return f"[{self.alert_level}] {self.title} ({self.site.name})"
