"""Initial migration for notifications app — state-only (tables owned by iot app)."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Create notification models in Django ORM state without touching the DB."""

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
                    name="NotificationChannel",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("channel_type", models.CharField(choices=[("EMAIL", "Email"), ("WEBHOOK", "Webhook"), ("TELEGRAM", "Telegram"), ("PUSH", "Web Push")], max_length=10)),
                        ("name", models.CharField(max_length=100)),
                        ("is_active", models.BooleanField(default=True)),
                        ("email_recipients", models.TextField(blank=True, help_text="Comma-separated email addresses (for EMAIL channel)")),
                        ("webhook_url", models.URLField(blank=True, help_text="Target URL (for WEBHOOK channel)")),
                        ("webhook_secret", models.CharField(blank=True, help_text="Optional secret for HMAC-SHA256 signature header (for WEBHOOK channel)", max_length=255)),
                        ("telegram_bot_token", models.CharField(blank=True, help_text="Telegram Bot API token (for TELEGRAM channel)", max_length=255)),
                        ("telegram_chat_id", models.CharField(blank=True, help_text="Telegram chat/group ID (for TELEGRAM channel)", max_length=100)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notification_channels", to="organizations.organization")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_notificationchannel"},
                ),
                migrations.CreateModel(
                    name="NotificationRule",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("name", models.CharField(max_length=100)),
                        ("alert_types", models.JSONField(blank=True, default=list, help_text="List of alert types to match, e.g. ['HIGH','LOW','OFFLINE']. Empty = all.")),
                        ("severities", models.JSONField(blank=True, default=list, help_text="List of severities to match, e.g. ['WARNING','CRITICAL']. Empty = all.")),
                        ("is_active", models.BooleanField(default=True)),
                        ("cooldown_seconds", models.PositiveIntegerField(default=300, help_text="Min seconds between notifications for the same rule")),
                        ("last_notified", models.DateTimeField(blank=True, null=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("channel", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rules", to="notifications.notificationchannel")),
                        ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notification_rules", to="organizations.organization")),
                    ],
                    options={"ordering": ["name"], "db_table": "iot_notificationrule"},
                ),
                migrations.CreateModel(
                    name="NotificationLog",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("status", models.CharField(choices=[("SENT", "Sent"), ("FAILED", "Failed")], max_length=10)),
                        ("error_message", models.TextField(blank=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("alert", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="notification_logs", to="greenhouse.alert")),
                        ("channel", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="logs", to="notifications.notificationchannel")),
                        ("rule", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="logs", to="notifications.notificationrule")),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_notificationlog"},
                ),
                migrations.CreateModel(
                    name="PushSubscription",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("endpoint", models.URLField(max_length=500, unique=True)),
                        ("p256dh", models.CharField(help_text="Client public encryption key", max_length=200)),
                        ("auth", models.CharField(help_text="Client auth secret", max_length=100)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="push_subscriptions", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={"ordering": ["-created_at"], "db_table": "iot_pushsubscription"},
                ),
            ],
        ),
    ]
