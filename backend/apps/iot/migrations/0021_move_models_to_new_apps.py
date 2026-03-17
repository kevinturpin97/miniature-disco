"""Stub migration: remove all models from iot app state (they moved to new apps).

NO database operations — tables remain unchanged. The new apps' migrations
create the corresponding model states using SeparateDatabaseAndState.
"""

from django.db import migrations


class Migration(migrations.Migration):
    """Remove iot models from Django ORM state after they were moved to dedicated apps."""

    dependencies = [
        ("iot", "0020_fleet_ota_firmware"),
        ("greenhouse", "0001_initial"),
        ("notifications", "0001_initial"),
        ("schedules", "0001_initial"),
        ("analytics", "0001_initial"),
        ("marketplace", "0001_initial"),
        ("sites", "0001_initial"),
        ("compliance", "0001_initial"),
        ("crop", "0001_initial"),
        ("fleet", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],  # Never touch the DB
            state_operations=[
                migrations.DeleteModel("Greenhouse"),
                migrations.DeleteModel("Zone"),
                migrations.DeleteModel("Sensor"),
                migrations.DeleteModel("SensorReading"),
                migrations.DeleteModel("Actuator"),
                migrations.DeleteModel("Command"),
                migrations.DeleteModel("AutomationRule"),
                migrations.DeleteModel("Alert"),
                migrations.DeleteModel("NotificationChannel"),
                migrations.DeleteModel("NotificationRule"),
                migrations.DeleteModel("NotificationLog"),
                migrations.DeleteModel("PushSubscription"),
                migrations.DeleteModel("Scenario"),
                migrations.DeleteModel("ScenarioStep"),
                migrations.DeleteModel("Schedule"),
                migrations.DeleteModel("SensorReadingHourly"),
                migrations.DeleteModel("AuditEvent"),
                migrations.DeleteModel("TemplateCategory"),
                migrations.DeleteModel("Template"),
                migrations.DeleteModel("TemplateRating"),
                migrations.DeleteModel("MLModel"),
                migrations.DeleteModel("SensorPrediction"),
                migrations.DeleteModel("AnomalyRecord"),
                migrations.DeleteModel("SmartSuggestion"),
                migrations.DeleteModel("SensorReadingDaily"),
                migrations.DeleteModel("RetentionPolicy"),
                migrations.DeleteModel("DataArchiveLog"),
                migrations.DeleteModel("Site"),
                migrations.DeleteModel("WeatherData"),
                migrations.DeleteModel("WeatherAlert"),
                migrations.DeleteModel("CropCycle"),
                migrations.DeleteModel("Note"),
                migrations.DeleteModel("CultureLog"),
                migrations.DeleteModel("TraceabilityReport"),
                migrations.DeleteModel("EdgeDevice"),
                migrations.DeleteModel("SyncBatch"),
                migrations.DeleteModel("CropStatus"),
                migrations.DeleteModel("CropIndicatorPreference"),
                migrations.DeleteModel("FirmwareRelease"),
                migrations.DeleteModel("DeviceOTAJob"),
                migrations.DeleteModel("DeviceMetrics"),
            ],
        ),
    ]
