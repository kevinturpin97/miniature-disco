"""Initial migration for billing app — state-only (tables owned by api app)."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create billing models in Django ORM state without touching the DB."""

    initial = True

    dependencies = [
        ("api", "0004_sprint28_cloud_tenant"),
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="Subscription",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("stripe_subscription_id", models.CharField(help_text="Stripe subscription ID", max_length=255, unique=True)),
                        ("stripe_price_id", models.CharField(blank=True, max_length=255)),
                        ("plan", models.CharField(choices=[("FREE", "Free"), ("PRO", "Pro"), ("ENTERPRISE", "Enterprise")], max_length=12)),
                        ("status", models.CharField(choices=[("TRIALING", "Trialing"), ("ACTIVE", "Active"), ("PAST_DUE", "Past Due"), ("CANCELED", "Canceled"), ("INCOMPLETE", "Incomplete")], default="TRIALING", max_length=12)),
                        ("current_period_start", models.DateTimeField(blank=True, null=True)),
                        ("current_period_end", models.DateTimeField(blank=True, null=True)),
                        ("cancel_at_period_end", models.BooleanField(default=False)),
                        ("canceled_at", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="subscription", to="organizations.organization")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "api_subscription"},
                ),
            ],
        ),
    ]
