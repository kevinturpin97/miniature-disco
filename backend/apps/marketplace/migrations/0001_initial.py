"""Initial migration for marketplace app — state-only (tables owned by iot app)."""

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create marketplace models in Django ORM state without touching the DB."""

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
                    name="TemplateCategory",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=100, unique=True)),
                        ("slug", models.SlugField(unique=True)),
                        ("description", models.TextField(blank=True)),
                        ("icon", models.CharField(blank=True, help_text="Icon identifier for the frontend", max_length=50)),
                        ("order", models.PositiveIntegerField(default=0, help_text="Display order in category list")),
                    ],
                    options={"ordering": ["order", "name"], "verbose_name_plural": "template categories", "db_table": "iot_templatecategory"},
                ),
                migrations.CreateModel(
                    name="Template",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=150)),
                        ("description", models.TextField(blank=True)),
                        ("is_official", models.BooleanField(default=False, help_text="Marked as official Greenhouse template")),
                        ("is_published", models.BooleanField(default=True, help_text="Visible on the marketplace")),
                        ("version", models.CharField(default="1.0.0", max_length=20)),
                        ("changelog", models.TextField(blank=True, help_text="Version changelog")),
                        ("config", models.JSONField(default=dict, help_text="Snapshot of zone configuration: sensors, actuators, automation_rules, scenarios")),
                        ("avg_rating", models.FloatField(default=0.0)),
                        ("rating_count", models.PositiveIntegerField(default=0)),
                        ("clone_count", models.PositiveIntegerField(default=0)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="templates", to="marketplace.templatecategory")),
                        ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_templates", to=settings.AUTH_USER_MODEL)),
                        ("organization", models.ForeignKey(blank=True, help_text="Organization that published this template", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="templates", to="organizations.organization")),
                    ],
                    options={"ordering": ["-clone_count", "-avg_rating", "-created_at"], "db_table": "iot_template"},
                ),
                migrations.CreateModel(
                    name="TemplateRating",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("score", models.PositiveSmallIntegerField(validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                        ("comment", models.TextField(blank=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("template", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ratings", to="marketplace.template")),
                        ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="template_ratings", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_templaterating", "unique_together": {("template", "user")}},
                ),
            ],
        ),
    ]
