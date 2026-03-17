"""Initial migration for greenhouse app — state-only (tables owned by iot app)."""

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create greenhouse models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("iot", "0020_fleet_ota_firmware"),
        ("organizations", "0001_initial"),
        ("sites", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Greenhouse",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=100)),
                        ("location", models.CharField(blank=True, max_length=255)),
                        ("description", models.TextField(blank=True)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="greenhouses", to="organizations.organization")),
                        ("owner", models.ForeignKey(blank=True, help_text="Legacy field — kept for audit. Use organization instead.", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="greenhouses", to=settings.AUTH_USER_MODEL)),
                        ("site", models.ForeignKey(blank=True, help_text="Geographic site this greenhouse belongs to", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="greenhouses", to="sites.site")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_greenhouse"},
                ),
                migrations.CreateModel(
                    name="Zone",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=100)),
                        ("relay_id", models.PositiveIntegerField(help_text="LoRa relay node ID (1–255). Unique per greenhouse (local LoRa network).", validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(255)])),
                        ("description", models.TextField(blank=True)),
                        ("is_active", models.BooleanField(default=True)),
                        ("last_seen", models.DateTimeField(blank=True, null=True)),
                        ("transmission_interval", models.PositiveIntegerField(default=300, help_text="Interval in seconds")),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("greenhouse", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="zones", to="greenhouse.greenhouse")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_zone", "unique_together": {("greenhouse", "relay_id")}},
                ),
                migrations.CreateModel(
                    name="Sensor",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("sensor_type", models.CharField(choices=[("TEMP", "Temperature (\u00b0C)"), ("HUM_AIR", "Air Humidity (%)"), ("HUM_SOIL", "Soil Humidity (%)"), ("PH", "pH Level"), ("LIGHT", "Light (lux)"), ("CO2", "CO2 (ppm)")], max_length=10)),
                        ("label", models.CharField(blank=True, max_length=100)),
                        ("unit", models.CharField(max_length=20)),
                        ("min_threshold", models.FloatField(blank=True, null=True)),
                        ("max_threshold", models.FloatField(blank=True, null=True)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sensors", to="greenhouse.zone")),
                    ],
                    options={"ordering": ["sensor_type"], "db_table": "iot_sensor", "unique_together": {("zone", "sensor_type")}},
                ),
                migrations.CreateModel(
                    name="SensorReading",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("value", models.FloatField()),
                        ("relay_timestamp", models.DateTimeField(blank=True, help_text="Timestamp from relay if available", null=True)),
                        ("received_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                        ("cloud_synced", models.BooleanField(db_index=True, default=False, help_text="Whether this record has been synced to the cloud")),
                        ("cloud_synced_at", models.DateTimeField(blank=True, help_text="Timestamp when this record was successfully synced to the cloud", null=True)),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="readings", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["-received_at"], "db_table": "iot_sensorreading"},
                ),
                migrations.CreateModel(
                    name="Actuator",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("actuator_type", models.CharField(choices=[("VALVE", "Water Valve"), ("FAN", "Ventilation Fan"), ("HEATER", "Heater"), ("LIGHT", "Grow Light"), ("PUMP", "Water Pump"), ("SHADE", "Shade Screen")], max_length=10)),
                        ("name", models.CharField(max_length=100)),
                        ("gpio_pin", models.PositiveIntegerField(blank=True, null=True)),
                        ("state", models.BooleanField(default=False)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="actuators", to="greenhouse.zone")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_actuator"},
                ),
                migrations.CreateModel(
                    name="AutomationRule",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=100)),
                        ("description", models.TextField(blank=True)),
                        ("sensor_type", models.CharField(choices=[("TEMP", "Temperature (\u00b0C)"), ("HUM_AIR", "Air Humidity (%)"), ("HUM_SOIL", "Soil Humidity (%)"), ("PH", "pH Level"), ("LIGHT", "Light (lux)"), ("CO2", "CO2 (ppm)")], max_length=10)),
                        ("condition", models.CharField(choices=[("GT", "Greater than"), ("LT", "Less than"), ("EQ", "Equal to"), ("GTE", "Greater or equal"), ("LTE", "Less or equal")], max_length=5)),
                        ("threshold_value", models.FloatField()),
                        ("action_command_type", models.CharField(choices=[("ON", "Turn On"), ("OFF", "Turn Off"), ("SET", "Set Value")], max_length=5)),
                        ("action_value", models.FloatField(blank=True, null=True)),
                        ("cooldown_seconds", models.PositiveIntegerField(default=300, help_text="Min seconds between triggers")),
                        ("is_active", models.BooleanField(default=True)),
                        ("last_triggered", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="automation_rules", to="greenhouse.zone")),
                        ("action_actuator", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="automation_rules", to="greenhouse.actuator")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_automationrule"},
                ),
                migrations.CreateModel(
                    name="Command",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("command_type", models.CharField(choices=[("ON", "Turn On"), ("OFF", "Turn Off"), ("SET", "Set Value")], max_length=5)),
                        ("value", models.FloatField(blank=True, help_text="Value for SET_VALUE commands", null=True)),
                        ("status", models.CharField(choices=[("PENDING", "Pending"), ("SENT", "Sent"), ("ACK", "Acknowledged"), ("FAILED", "Failed"), ("TIMEOUT", "Timeout")], default="PENDING", max_length=10)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("sent_at", models.DateTimeField(blank=True, null=True)),
                        ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                        ("error_message", models.TextField(blank=True)),
                        ("cloud_synced", models.BooleanField(db_index=True, default=False, help_text="Whether this record has been synced to the cloud")),
                        ("cloud_synced_at", models.DateTimeField(blank=True, help_text="Timestamp when this record was successfully synced to the cloud", null=True)),
                        ("actuator", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="commands", to="greenhouse.actuator")),
                        ("automation_rule", models.ForeignKey(blank=True, help_text="The automation rule that triggered this command, if any", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="triggered_commands", to="greenhouse.automationrule")),
                        ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_command"},
                ),
                migrations.CreateModel(
                    name="Alert",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("alert_type", models.CharField(choices=[("HIGH", "Threshold High"), ("LOW", "Threshold Low"), ("OFFLINE", "Relay Offline"), ("ERROR", "Sensor Error"), ("CMD_FAIL", "Command Failed")], max_length=10)),
                        ("severity", models.CharField(choices=[("INFO", "Info"), ("WARNING", "Warning"), ("CRITICAL", "Critical")], default="WARNING", max_length=10)),
                        ("value", models.FloatField(blank=True, null=True)),
                        ("message", models.TextField()),
                        ("is_acknowledged", models.BooleanField(default=False)),
                        ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("cloud_synced", models.BooleanField(db_index=True, default=False, help_text="Whether this record has been synced to the cloud")),
                        ("cloud_synced_at", models.DateTimeField(blank=True, help_text="Timestamp when this record was successfully synced to the cloud", null=True)),
                        ("sensor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="greenhouse.sensor")),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="greenhouse.zone")),
                        ("acknowledged_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_alert"},
                ),
            ],
        ),
    ]
