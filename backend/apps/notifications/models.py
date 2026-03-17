"""Notifications app models — NotificationChannel, NotificationRule, NotificationLog, PushSubscription."""

from django.conf import settings
from django.db import models

from apps.organizations.models import Organization


class NotificationChannel(models.Model):
    """A notification delivery channel configured per organization."""

    class ChannelType(models.TextChoices):
        EMAIL = "EMAIL", "Email"
        WEBHOOK = "WEBHOOK", "Webhook"
        TELEGRAM = "TELEGRAM", "Telegram"
        PUSH = "PUSH", "Web Push"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="notification_channels",
    )
    channel_type = models.CharField(max_length=10, choices=ChannelType.choices)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    # EMAIL: comma-separated recipient addresses
    email_recipients = models.TextField(
        blank=True,
        help_text="Comma-separated email addresses (for EMAIL channel)",
    )

    # WEBHOOK: target URL and optional secret for HMAC signing
    webhook_url = models.URLField(
        blank=True,
        help_text="Target URL (for WEBHOOK channel)",
    )
    webhook_secret = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional secret for HMAC-SHA256 signature header (for WEBHOOK channel)",
    )

    # TELEGRAM: bot token and chat ID
    telegram_bot_token = models.CharField(
        max_length=255,
        blank=True,
        help_text="Telegram Bot API token (for TELEGRAM channel)",
    )
    telegram_chat_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Telegram chat/group ID (for TELEGRAM channel)",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        db_table = "iot_notificationchannel"

    def __str__(self) -> str:
        return f"{self.name} ({self.get_channel_type_display()})"


class NotificationRule(models.Model):
    """Maps alert conditions to notification channels."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="notification_rules",
    )
    name = models.CharField(max_length=100)
    channel = models.ForeignKey(
        NotificationChannel,
        on_delete=models.CASCADE,
        related_name="rules",
    )
    alert_types = models.JSONField(
        default=list,
        blank=True,
        help_text="List of alert types to match, e.g. ['HIGH','LOW','OFFLINE']. Empty = all.",
    )
    severities = models.JSONField(
        default=list,
        blank=True,
        help_text="List of severities to match, e.g. ['WARNING','CRITICAL']. Empty = all.",
    )
    is_active = models.BooleanField(default=True)
    cooldown_seconds = models.PositiveIntegerField(
        default=300,
        help_text="Min seconds between notifications for the same rule",
    )
    last_notified = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        db_table = "iot_notificationrule"

    def __str__(self) -> str:
        return f"{self.name} → {self.channel.name}"


class NotificationLog(models.Model):
    """Audit trail of sent notifications."""

    class Status(models.TextChoices):
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    rule = models.ForeignKey(
        NotificationRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    channel = models.ForeignKey(
        NotificationChannel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    alert = models.ForeignKey(
        "greenhouse.Alert",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_logs",
    )
    status = models.CharField(max_length=10, choices=Status.choices)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "iot_notificationlog"

    def __str__(self) -> str:
        return f"{self.status} via {self.channel} @ {self.created_at}"


class PushSubscription(models.Model):
    """Web Push subscription stored per user for push notification delivery."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200, help_text="Client public encryption key")
    auth = models.CharField(max_length=100, help_text="Client auth secret")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "iot_pushsubscription"

    def __str__(self) -> str:
        return f"PushSub({self.user.username}@{self.endpoint[:40]}...)"
