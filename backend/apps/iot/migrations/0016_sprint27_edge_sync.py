# Generated for Sprint 27 — Edge Sync Agent

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0003_billing_subscription"),
        ("iot", "0015_sprint25_compliance_traceability"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # --- cloud_synced / cloud_synced_at on SensorReading ---
        migrations.AddField(
            model_name="sensorreading",
            name="cloud_synced",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this record has been synced to the cloud",
            ),
        ),
        migrations.AddField(
            model_name="sensorreading",
            name="cloud_synced_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text="Timestamp when this record was successfully synced to the cloud",
            ),
        ),
        # --- cloud_synced / cloud_synced_at on Command ---
        migrations.AddField(
            model_name="command",
            name="cloud_synced",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this record has been synced to the cloud",
            ),
        ),
        migrations.AddField(
            model_name="command",
            name="cloud_synced_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text="Timestamp when this record was successfully synced to the cloud",
            ),
        ),
        # --- cloud_synced / cloud_synced_at on Alert ---
        migrations.AddField(
            model_name="alert",
            name="cloud_synced",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this record has been synced to the cloud",
            ),
        ),
        migrations.AddField(
            model_name="alert",
            name="cloud_synced_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text="Timestamp when this record was successfully synced to the cloud",
            ),
        ),
        # --- cloud_synced / cloud_synced_at on AuditEvent ---
        migrations.AddField(
            model_name="auditevent",
            name="cloud_synced",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this record has been synced to the cloud",
            ),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="cloud_synced_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text="Timestamp when this record was successfully synced to the cloud",
            ),
        ),
        # --- New indexes on SensorReading and AuditEvent ---
        migrations.AddIndex(
            model_name="sensorreading",
            index=models.Index(
                fields=["cloud_synced", "-received_at"],
                name="iot_sensorre_cloud_s_recv_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="auditevent",
            index=models.Index(
                fields=["cloud_synced", "-created_at"],
                name="iot_auditeve_cloud_s_crea_idx",
            ),
        ),
        # --- EdgeDevice model ---
        migrations.CreateModel(
            name="EdgeDevice",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "device_id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        unique=True,
                        db_index=True,
                        help_text="Auto-generated UUID, stable identifier for this device",
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        max_length=150,
                        help_text="Human-friendly device name (e.g. 'Raspberry Pi Site Nord')",
                    ),
                ),
                (
                    "secret_key",
                    models.CharField(
                        max_length=64,
                        help_text="HMAC-SHA256 signing key — never expose in API responses",
                    ),
                ),
                (
                    "firmware_version",
                    models.CharField(
                        blank=True,
                        max_length=50,
                        help_text="Firmware version string reported by the device",
                    ),
                ),
                (
                    "last_sync_at",
                    models.DateTimeField(
                        blank=True,
                        null=True,
                        help_text="Timestamp of the last successful sync",
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="edge_devices",
                        to="api.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        # --- SyncBatch model ---
        migrations.CreateModel(
            name="SyncBatch",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("SUCCESS", "Success"),
                            ("FAILED", "Failed"),
                            ("RETRY", "Retrying"),
                        ],
                        default="PENDING",
                        max_length=10,
                    ),
                ),
                (
                    "records_count",
                    models.PositiveIntegerField(
                        default=0,
                        help_text="Number of records in the batch",
                    ),
                ),
                (
                    "payload_size_kb",
                    models.FloatField(
                        default=0.0,
                        help_text="Compressed payload size in KB",
                    ),
                ),
                (
                    "retry_count",
                    models.PositiveIntegerField(
                        default=0,
                        help_text="Number of retry attempts",
                    ),
                ),
                (
                    "next_retry_at",
                    models.DateTimeField(
                        blank=True,
                        null=True,
                        help_text="Scheduled time for next retry attempt",
                    ),
                ),
                ("error_message", models.TextField(blank=True)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "edge_device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sync_batches",
                        to="iot.edgedevice",
                    ),
                ),
            ],
            options={
                "ordering": ["-started_at"],
            },
        ),
        migrations.AddIndex(
            model_name="syncbatch",
            index=models.Index(
                fields=["edge_device", "-started_at"],
                name="iot_syncbatch_device_start_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="syncbatch",
            index=models.Index(
                fields=["status", "next_retry_at"],
                name="iot_syncbatch_status_retry_idx",
            ),
        ),
    ]
