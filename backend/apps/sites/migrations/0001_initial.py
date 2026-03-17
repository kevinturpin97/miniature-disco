"""Initial migration for sites app — state-only (tables owned by iot app)."""

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create site models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("iot", "0020_fleet_ota_firmware"),
        ("organizations", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Site",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=150)),
                        ("address", models.CharField(blank=True, max_length=500)),
                        ("latitude", models.FloatField(validators=[django.core.validators.MinValueValidator(-90.0), django.core.validators.MaxValueValidator(90.0)])),
                        ("longitude", models.FloatField(validators=[django.core.validators.MinValueValidator(-180.0), django.core.validators.MaxValueValidator(180.0)])),
                        ("timezone", models.CharField(default="UTC", help_text="IANA timezone identifier (e.g. Europe/Paris)", max_length=50)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sites", to="organizations.organization")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_site"},
                ),
                migrations.CreateModel(
                    name="WeatherData",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("timestamp", models.DateTimeField(help_text="Time of the weather observation")),
                        ("temperature", models.FloatField(blank=True, help_text="External temperature in °C", null=True)),
                        ("humidity", models.FloatField(blank=True, help_text="Relative humidity in %", null=True)),
                        ("precipitation", models.FloatField(blank=True, help_text="Precipitation in mm", null=True)),
                        ("wind_speed", models.FloatField(blank=True, help_text="Wind speed in km/h", null=True)),
                        ("uv_index", models.FloatField(blank=True, help_text="UV index", null=True)),
                        ("cloud_cover", models.FloatField(blank=True, help_text="Cloud cover in %", null=True)),
                        ("weather_code", models.IntegerField(blank=True, help_text="WMO weather interpretation code", null=True)),
                        ("is_forecast", models.BooleanField(default=False, help_text="True if this is a forecast, False if historical/current")),
                        ("fetched_at", models.DateTimeField(auto_now_add=True)),
                        ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="weather_data", to="sites.site")),
                    ],
                    options={"ordering": ["-timestamp"], "db_table": "iot_weatherdata"},
                ),
                migrations.CreateModel(
                    name="WeatherAlert",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("alert_level", models.CharField(choices=[("INFO", "Info"), ("WARNING", "Warning"), ("CRITICAL", "Critical")], default="WARNING", max_length=10)),
                        ("title", models.CharField(max_length=200)),
                        ("message", models.TextField()),
                        ("forecast_date", models.DateField(help_text="Date of the forecasted event")),
                        ("is_acknowledged", models.BooleanField(default=False)),
                        ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="weather_alerts", to="sites.site")),
                        ("acknowledged_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_weatheralert"},
                ),
            ],
        ),
    ]
