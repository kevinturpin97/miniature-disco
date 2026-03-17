"""Initial migration for fleet app — state-only (tables owned by iot app)."""

import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create fleet models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("iot", "0020_fleet_ota_firmware"),
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="EdgeDevice",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("device_id", models.UUIDField(db_index=True, default=uuid.uuid4, help_text="Auto-generated UUID, stable identifier for this device", unique=True)),
                        ("name", models.CharField(help_text="Human-friendly device name (e.g. 'Raspberry Pi Site Nord')", max_length=150)),
                        ("secret_key", models.CharField(help_text="HMAC-SHA256 signing key — never expose in API responses", max_length=64)),
                        ("firmware_version", models.CharField(blank=True, help_text="Firmware version string reported by the device", max_length=50)),
                        ("last_sync_at", models.DateTimeField(blank=True, help_text="Timestamp of the last successful sync", null=True)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="edge_devices", to="organizations.organization")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_edgedevice"},
                ),
                migrations.CreateModel(
                    name="SyncBatch",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("status", models.CharField(choices=[("PENDING", "Pending"), ("SUCCESS", "Success"), ("FAILED", "Failed"), ("RETRY", "Retrying")], default="PENDING", max_length=10)),
                        ("records_count", models.PositiveIntegerField(default=0, help_text="Number of records in the batch")),
                        ("payload_size_kb", models.FloatField(default=0.0, help_text="Compressed payload size in KB")),
                        ("retry_count", models.PositiveIntegerField(default=0, help_text="Number of retry attempts")),
                        ("next_retry_at", models.DateTimeField(blank=True, help_text="Scheduled time for next retry attempt", null=True)),
                        ("error_message", models.TextField(blank=True)),
                        ("started_at", models.DateTimeField(auto_now_add=True)),
                        ("completed_at", models.DateTimeField(blank=True, null=True)),
                        ("edge_device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sync_batches", to="fleet.edgedevice")),
                    ],
                    options={"ordering": ["-started_at"], "db_table": "iot_syncbatch"},
                ),
                migrations.CreateModel(
                    name="FirmwareRelease",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("version", models.CharField(help_text="Semantic version string (e.g., 3.2.1)", max_length=30, unique=True)),
                        ("channel", models.CharField(choices=[("STABLE", "Stable"), ("BETA", "Beta"), ("NIGHTLY", "Nightly")], default="STABLE", max_length=10)),
                        ("release_notes", models.TextField(blank=True)),
                        ("binary_url", models.URLField(help_text="URL to the firmware binary", max_length=500)),
                        ("checksum_sha256", models.CharField(help_text="SHA-256 hex digest of the binary", max_length=64)),
                        ("file_size_bytes", models.PositiveIntegerField(help_text="Binary size in bytes")),
                        ("min_hardware_version", models.CharField(blank=True, help_text="Minimum hardware version required (optional)", max_length=30)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_firmwarerelease"},
                ),
                migrations.CreateModel(
                    name="DeviceOTAJob",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("status", models.CharField(choices=[("PENDING", "Pending"), ("DOWNLOADING", "Downloading"), ("INSTALLING", "Installing"), ("SUCCESS", "Success"), ("FAILED", "Failed"), ("ROLLED_BACK", "Rolled Back")], default="PENDING", max_length=15)),
                        ("progress_percent", models.PositiveIntegerField(default=0, help_text="Download/install progress (0–100)")),
                        ("previous_version", models.CharField(blank=True, help_text="Firmware version before this update", max_length=30)),
                        ("error_message", models.TextField(blank=True)),
                        ("started_at", models.DateTimeField(blank=True, null=True)),
                        ("completed_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("edge_device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ota_jobs", to="fleet.edgedevice")),
                        ("firmware_release", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ota_jobs", to="fleet.firmwarerelease")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_deviceotajob"},
                ),
                migrations.CreateModel(
                    name="DeviceMetrics",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("cpu_percent", models.FloatField(help_text="CPU usage 0–100")),
                        ("memory_percent", models.FloatField(help_text="RAM usage 0–100")),
                        ("disk_percent", models.FloatField(help_text="Disk usage 0–100")),
                        ("cpu_temperature", models.FloatField(blank=True, help_text="CPU temperature in °C", null=True)),
                        ("uptime_seconds", models.PositiveIntegerField(blank=True, help_text="Device uptime in seconds", null=True)),
                        ("network_latency_ms", models.FloatField(blank=True, help_text="Network latency to cloud in ms", null=True)),
                        ("recorded_at", models.DateTimeField(db_index=True)),
                        ("edge_device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="metrics", to="fleet.edgedevice")),
                    ],
                    options={"ordering": ["-recorded_at"], "verbose_name": "Device Metrics", "verbose_name_plural": "Device Metrics", "db_table": "iot_devicemetrics"},
                ),
            ],
        ),
    ]
