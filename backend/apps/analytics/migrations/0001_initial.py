"""Initial migration for analytics app — state-only (tables owned by iot app)."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create analytics models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("iot", "0020_fleet_ota_firmware"),
        ("organizations", "0001_initial"),
        ("greenhouse", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="SensorReadingHourly",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("hour", models.DateTimeField(help_text="Start of the hour bucket")),
                        ("avg_value", models.FloatField()),
                        ("min_value", models.FloatField()),
                        ("max_value", models.FloatField()),
                        ("stddev_value", models.FloatField(default=0.0)),
                        ("count", models.PositiveIntegerField()),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="hourly_readings", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["-hour"], "db_table": "iot_sensorreadinghourly", "unique_together": {("sensor", "hour")}},
                ),
                migrations.CreateModel(
                    name="SensorReadingDaily",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("date", models.DateField(help_text="The calendar date for this bucket")),
                        ("avg_value", models.FloatField()),
                        ("min_value", models.FloatField()),
                        ("max_value", models.FloatField()),
                        ("stddev_value", models.FloatField(default=0.0)),
                        ("count", models.PositiveIntegerField()),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="daily_readings", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["-date"], "db_table": "iot_sensorreadingdaily", "unique_together": {("sensor", "date")}},
                ),
                migrations.CreateModel(
                    name="RetentionPolicy",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("raw_retention_days", models.PositiveIntegerField(default=30, help_text="Days to keep raw SensorReading data (0 = forever)")),
                        ("hourly_retention_days", models.PositiveIntegerField(default=365, help_text="Days to keep hourly aggregated data (0 = forever)")),
                        ("daily_retention_days", models.PositiveIntegerField(default=0, help_text="Days to keep daily aggregated data (0 = forever)")),
                        ("archive_to_cold_storage", models.BooleanField(default=False, help_text="Whether to archive data to S3/MinIO before deletion")),
                        ("cold_storage_bucket", models.CharField(blank=True, help_text="S3/MinIO bucket name for cold storage archival", max_length=255)),
                        ("cold_storage_prefix", models.CharField(blank=True, default="greenhouse-archive/", help_text="Key prefix within the bucket", max_length=255)),
                        ("last_cleanup_at", models.DateTimeField(blank=True, null=True)),
                        ("last_archive_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="retention_policy", to="organizations.organization")),
                    ],
                    options={"verbose_name_plural": "retention policies", "db_table": "iot_retentionpolicy"},
                ),
                migrations.CreateModel(
                    name="DataArchiveLog",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("archive_type", models.CharField(choices=[("RAW", "Raw Readings"), ("HOURLY", "Hourly Readings")], max_length=10)),
                        ("status", models.CharField(choices=[("STARTED", "Started"), ("COMPLETED", "Completed"), ("FAILED", "Failed")], default="STARTED", max_length=10)),
                        ("records_archived", models.PositiveIntegerField(default=0)),
                        ("records_deleted", models.PositiveIntegerField(default=0)),
                        ("date_range_start", models.DateTimeField(help_text="Start of archived date range")),
                        ("date_range_end", models.DateTimeField(help_text="End of archived date range")),
                        ("storage_path", models.CharField(blank=True, help_text="S3/MinIO path where data was archived", max_length=500)),
                        ("error_message", models.TextField(blank=True)),
                        ("started_at", models.DateTimeField(auto_now_add=True)),
                        ("completed_at", models.DateTimeField(blank=True, null=True)),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="archive_logs", to="organizations.organization")),
                    ],
                    options={"ordering": ["-started_at"], "db_table": "iot_dataarchivelog"},
                ),
                migrations.CreateModel(
                    name="AuditEvent",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("action", models.CharField(choices=[("CREATE", "Create"), ("UPDATE", "Update"), ("DELETE", "Delete"), ("LOGIN", "Login"), ("LOGOUT", "Logout"), ("COMMAND", "Command Sent"), ("EXPORT", "Data Export")], max_length=10)),
                        ("resource_type", models.CharField(help_text="Model name or resource type (e.g. 'Greenhouse', 'Zone', 'Command')", max_length=50)),
                        ("resource_id", models.PositiveIntegerField(blank=True, help_text="Primary key of the affected resource", null=True)),
                        ("description", models.TextField(blank=True, help_text="Human-readable description of the action")),
                        ("changes", models.JSONField(blank=True, default=dict, help_text="JSON diff of changed fields (old_value → new_value)")),
                        ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                        ("user_agent", models.TextField(blank=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                        ("cloud_synced", models.BooleanField(db_index=True, default=False, help_text="Whether this record has been synced to the cloud")),
                        ("cloud_synced_at", models.DateTimeField(blank=True, help_text="Timestamp when this record was successfully synced to the cloud", null=True)),
                        ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="audit_events", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_auditevent"},
                ),
                migrations.CreateModel(
                    name="MLModel",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("model_type", models.CharField(choices=[("IF", "Isolation Forest"), ("LR", "Linear Regression")], max_length=5)),
                        ("model_data", models.BinaryField(help_text="Pickled scikit-learn model")),
                        ("training_samples", models.PositiveIntegerField(default=0)),
                        ("mean_absolute_error", models.FloatField(blank=True, null=True)),
                        ("last_trained_at", models.DateTimeField(auto_now=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ml_models", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["-last_trained_at"], "db_table": "iot_mlmodel", "unique_together": {("sensor", "model_type")}},
                ),
                migrations.CreateModel(
                    name="SensorPrediction",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("predicted_at", models.DateTimeField(help_text="The future timestamp this prediction is for")),
                        ("predicted_value", models.FloatField()),
                        ("confidence_lower", models.FloatField(help_text="Lower bound of 95% confidence interval")),
                        ("confidence_upper", models.FloatField(help_text="Upper bound of 95% confidence interval")),
                        ("generated_at", models.DateTimeField(auto_now_add=True)),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="predictions", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["predicted_at"], "db_table": "iot_sensorprediction"},
                ),
                migrations.CreateModel(
                    name="AnomalyRecord",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("detection_method", models.CharField(choices=[("ZSCORE", "Z-Score"), ("IF", "Isolation Forest")], max_length=10)),
                        ("anomaly_score", models.FloatField(help_text="Anomaly score (higher = more anomalous)")),
                        ("value", models.FloatField()),
                        ("explanation", models.TextField(blank=True)),
                        ("detected_at", models.DateTimeField(auto_now_add=True)),
                        ("reading", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="anomalies", to="greenhouse.sensorreading")),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="anomalies", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["-detected_at"], "db_table": "iot_anomalyrecord"},
                ),
                migrations.CreateModel(
                    name="SmartSuggestion",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("suggestion_type", models.CharField(choices=[("THRESH", "Threshold Adjustment"), ("TREND", "Trend Warning")], max_length=10)),
                        ("message", models.TextField()),
                        ("suggested_min", models.FloatField(blank=True, null=True)),
                        ("suggested_max", models.FloatField(blank=True, null=True)),
                        ("confidence", models.FloatField(default=0.0, help_text="Confidence score (0-1)")),
                        ("is_applied", models.BooleanField(default=False)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("sensor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="suggestions", to="greenhouse.sensor")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_smartsuggestion"},
                ),
            ],
        ),
    ]
