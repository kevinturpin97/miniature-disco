"""Initial migration for cloud app — state-only (tables owned by api app)."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create cloud models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("api", "0004_sprint28_cloud_tenant"),
        ("organizations", "0001_initial"),
        ("fleet", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="CloudTenant",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("cloud_storage_mb", models.FloatField(default=0.0, help_text="Estimated cloud storage used by this tenant in MB")),
                        ("last_activity", models.DateTimeField(blank=True, help_text="Timestamp of the last sync or API call from this tenant", null=True)),
                        ("support_notes", models.TextField(blank=True, help_text="Internal support notes visible only to operators")),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.OneToOneField(help_text="The organization this tenant record belongs to", on_delete=django.db.models.deletion.CASCADE, related_name="cloud_tenant", to="organizations.organization")),
                        ("edge_devices", models.ManyToManyField(blank=True, help_text="Raspberry Pi devices registered for this tenant", related_name="cloud_tenants", to="fleet.edgedevice")),
                    ],
                    options={"ordering": ["-last_activity", "organization__name"], "verbose_name": "Cloud Tenant", "verbose_name_plural": "Cloud Tenants", "db_table": "api_cloudtenant"},
                ),
                migrations.CreateModel(
                    name="ImpersonationToken",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("token", models.CharField(help_text="Opaque token string (never store raw — hashed in DB)", max_length=128, unique=True)),
                        ("expires_at", models.DateTimeField(help_text="Token becomes invalid after this time")),
                        ("used_at", models.DateTimeField(blank=True, null=True)),
                        ("is_revoked", models.BooleanField(default=False)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("organization", models.ForeignKey(help_text="The client organization being impersonated", on_delete=django.db.models.deletion.CASCADE, related_name="impersonation_tokens", to="organizations.organization")),
                        ("created_by", models.ForeignKey(help_text="The operator who issued this token", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="issued_impersonation_tokens", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "api_impersonationtoken"},
                ),
            ],
        ),
    ]
