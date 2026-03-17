"""Initial migration for organizations app — state-only (tables owned by api app)."""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models

import apps.organizations.models


class Migration(migrations.Migration):
    """Create the organizations models in Django ORM state without touching the DB.

    Tables already exist under the api_ prefix from the api app migrations.
    SeparateDatabaseAndState with empty database_operations ensures zero DDL.
    """

    initial = True

    dependencies = [
        ("api", "0004_sprint28_cloud_tenant"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Organization",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=100)),
                        ("slug", models.SlugField(unique=True)),
                        ("plan", models.CharField(choices=[("FREE", "Free"), ("PRO", "Pro"), ("ENTERPRISE", "Enterprise")], default="FREE", max_length=12)),
                        ("trial_ends_at", models.DateTimeField(blank=True, help_text="End of trial period", null=True)),
                        ("stripe_customer_id", models.CharField(blank=True, help_text="Stripe customer ID", max_length=255)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                    ],
                    options={"ordering": ["name"], "db_table": "api_organization"},
                ),
                migrations.CreateModel(
                    name="Membership",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("role", models.CharField(choices=[("OWNER", "Owner"), ("ADMIN", "Admin"), ("OPERATOR", "Operator"), ("VIEWER", "Viewer")], default="VIEWER", max_length=10)),
                        ("joined_at", models.DateTimeField(auto_now_add=True)),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="organizations.organization")),
                        ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["role", "joined_at"], "db_table": "api_membership", "unique_together": {("user", "organization")}},
                ),
                migrations.CreateModel(
                    name="Invitation",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("email", models.EmailField(max_length=254)),
                        ("role", models.CharField(choices=[("OWNER", "Owner"), ("ADMIN", "Admin"), ("OPERATOR", "Operator"), ("VIEWER", "Viewer")], default="VIEWER", max_length=10)),
                        ("token", models.CharField(default=apps.organizations.models._generate_invite_token, max_length=64, unique=True)),
                        ("accepted", models.BooleanField(default=False)),
                        ("expires_at", models.DateTimeField()),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="invitations", to="organizations.organization")),
                        ("invited_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "api_invitation"},
                ),
            ],
        ),
    ]
