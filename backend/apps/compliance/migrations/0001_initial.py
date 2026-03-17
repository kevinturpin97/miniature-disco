"""Initial migration for compliance app — state-only (tables owned by iot app)."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create compliance models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("iot", "0020_fleet_ota_firmware"),
        ("greenhouse", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="CropCycle",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("species", models.CharField(help_text="Plant species (e.g. Solanum lycopersicum)", max_length=150)),
                        ("variety", models.CharField(blank=True, help_text="Cultivar or variety name", max_length=150)),
                        ("status", models.CharField(choices=[("PLANNED", "Planned"), ("ACTIVE", "Active"), ("HARVESTED", "Harvested"), ("COMPLETED", "Completed"), ("CANCELLED", "Cancelled")], default="PLANNED", max_length=10)),
                        ("sowing_date", models.DateField(blank=True, null=True)),
                        ("transplant_date", models.DateField(blank=True, null=True)),
                        ("harvest_start_date", models.DateField(blank=True, null=True)),
                        ("harvest_end_date", models.DateField(blank=True, null=True)),
                        ("expected_yield", models.CharField(blank=True, help_text="Expected yield (e.g. 5kg/m2)", max_length=100)),
                        ("actual_yield", models.CharField(blank=True, help_text="Actual yield recorded", max_length=100)),
                        ("notes", models.TextField(blank=True, help_text="General notes about this crop cycle")),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="crop_cycles", to=settings.AUTH_USER_MODEL)),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="crop_cycles", to="greenhouse.zone")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_cropcycle"},
                ),
                migrations.CreateModel(
                    name="Note",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("content", models.TextField(help_text="Observation or field note")),
                        ("observed_at", models.DateTimeField(help_text="When the observation was made (can differ from created_at)")),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("author", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="zone_notes", to=settings.AUTH_USER_MODEL)),
                        ("crop_cycle", models.ForeignKey(blank=True, help_text="Optional link to an active crop cycle", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="zone_notes", to="compliance.cropcycle")),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notes", to="greenhouse.zone")),
                    ],
                    options={"ordering": ["-observed_at"], "db_table": "iot_note"},
                ),
                migrations.CreateModel(
                    name="CultureLog",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("entry_type", models.CharField(choices=[("COMMAND", "Command Sent"), ("ALERT", "Alert Triggered"), ("NOTE", "Manual Note"), ("THRESHOLD", "Threshold Changed"), ("CROP", "Crop Cycle Event"), ("AUTOMATION", "Automation Triggered")], max_length=10)),
                        ("summary", models.TextField(help_text="Human-readable summary of the event")),
                        ("details", models.JSONField(blank=True, default=dict, help_text="Structured data about the event (command details, alert info, etc.)")),
                        ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                        ("crop_cycle", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="culture_logs", to="compliance.cropcycle")),
                        ("user", models.ForeignKey(blank=True, help_text="User who triggered the action, if applicable", null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="culture_logs", to="greenhouse.zone")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_culturelog"},
                ),
                migrations.CreateModel(
                    name="TraceabilityReport",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("period_start", models.DateField()),
                        ("period_end", models.DateField()),
                        ("pdf_file", models.BinaryField(help_text="Generated PDF binary content")),
                        ("sha256_hash", models.CharField(help_text="SHA256 hash of the PDF content for integrity verification", max_length=64)),
                        ("signed_at", models.DateTimeField(help_text="Timestamp when the hash was computed")),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("crop_cycle", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="traceability_reports", to="compliance.cropcycle")),
                        ("generated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                        ("zone", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="traceability_reports", to="greenhouse.zone")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_traceabilityreport"},
                ),
            ],
        ),
    ]
