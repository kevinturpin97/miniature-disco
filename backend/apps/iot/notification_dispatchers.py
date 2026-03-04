"""Notification dispatchers for different channel types.

Each dispatcher function takes an Alert and a NotificationChannel,
sends the notification, and returns True on success or raises on failure.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from pywebpush import WebPushException, webpush

from .models import Alert, NotificationChannel, PushSubscription

logger = logging.getLogger(__name__)


def _build_alert_context(alert: Alert) -> dict[str, Any]:
    """Build a template context dict from an Alert instance.

    Args:
        alert: The Alert to extract context from.

    Returns:
        Dict with alert fields ready for templates / payloads.
    """
    zone = alert.zone
    greenhouse = zone.greenhouse
    org = greenhouse.organization
    return {
        "alert_id": alert.pk,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "zone_name": zone.name,
        "zone_id": zone.pk,
        "greenhouse_name": greenhouse.name,
        "greenhouse_id": greenhouse.pk,
        "organization_name": org.name if org else "",
        "message": alert.message,
        "value": alert.value,
        "created_at": alert.created_at.isoformat() if alert.created_at else "",
    }


def dispatch_email(alert: Alert, channel: NotificationChannel) -> None:
    """Send an alert notification email.

    Args:
        alert: The Alert that triggered the notification.
        channel: The EMAIL NotificationChannel with recipient addresses.

    Raises:
        ValueError: If no recipients configured.
        Exception: On mail send failure.
    """
    recipients_raw = channel.email_recipients.strip()
    if not recipients_raw:
        raise ValueError("No email recipients configured for this channel.")

    recipients = [addr.strip() for addr in recipients_raw.split(",") if addr.strip()]
    if not recipients:
        raise ValueError("No valid email recipients after parsing.")

    context = _build_alert_context(alert)
    html_body = render_to_string("notifications/alert_email.html", context)
    text_body = strip_tags(html_body)
    subject = f"[{alert.severity}] {alert.get_alert_type_display()} — {alert.zone.name}"

    send_mail(
        subject=subject,
        message=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipients,
        html_message=html_body,
        fail_silently=False,
    )
    logger.info("Email notification sent for alert %s to %s", alert.pk, recipients)


def dispatch_webhook(alert: Alert, channel: NotificationChannel) -> None:
    """Send an alert notification via generic webhook POST.

    The payload is JSON with all alert fields. If a webhook_secret is
    configured, an ``X-Greenhouse-Signature`` header is included with
    an HMAC-SHA256 hex digest.

    Args:
        alert: The Alert that triggered the notification.
        channel: The WEBHOOK NotificationChannel with URL and optional secret.

    Raises:
        ValueError: If no webhook URL configured.
        Exception: On HTTP failure.
    """
    url = channel.webhook_url.strip()
    if not url:
        raise ValueError("No webhook URL configured for this channel.")

    payload = json.dumps(_build_alert_context(alert), default=str).encode("utf-8")

    headers: dict[str, str] = {"Content-Type": "application/json"}

    if channel.webhook_secret:
        signature = hmac.new(
            channel.webhook_secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        headers["X-Greenhouse-Signature"] = f"sha256={signature}"

    req = Request(url, data=payload, headers=headers, method="POST")
    with urlopen(req, timeout=10) as resp:
        status = resp.status

    if status >= 400:
        raise RuntimeError(f"Webhook returned HTTP {status}")

    logger.info("Webhook notification sent for alert %s to %s (HTTP %s)", alert.pk, url, status)


def dispatch_telegram(alert: Alert, channel: NotificationChannel) -> None:
    """Send an alert notification via Telegram Bot API.

    Args:
        alert: The Alert that triggered the notification.
        channel: The TELEGRAM NotificationChannel with bot token and chat ID.

    Raises:
        ValueError: If bot token or chat ID not configured.
        Exception: On Telegram API failure.
    """
    bot_token = channel.telegram_bot_token.strip()
    chat_id = channel.telegram_chat_id.strip()

    if not bot_token or not chat_id:
        raise ValueError("Telegram bot_token and chat_id are required.")

    severity_emoji = {"CRITICAL": "\u26a0\ufe0f", "WARNING": "\u26a0", "INFO": "\u2139\ufe0f"}
    emoji = severity_emoji.get(alert.severity, "")

    text = (
        f"{emoji} *{alert.severity}* — {alert.get_alert_type_display()}\n"
        f"*Zone:* {alert.zone.name} ({alert.zone.greenhouse.name})\n"
        f"*Message:* {alert.message}"
    )
    if alert.value is not None:
        text += f"\n*Value:* {alert.value}"

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }).encode("utf-8")

    req = Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=10) as resp:
        status = resp.status

    if status >= 400:
        raise RuntimeError(f"Telegram API returned HTTP {status}")

    logger.info("Telegram notification sent for alert %s to chat %s", alert.pk, chat_id)


def dispatch_push(alert: Alert, channel: NotificationChannel) -> None:
    """Send push notifications to all subscribed users in the organization.

    Uses the Web Push protocol with VAPID authentication. Sends to every
    PushSubscription belonging to users who are members of the channel's
    organization.

    Args:
        alert: The Alert that triggered the notification.
        channel: The PUSH NotificationChannel.

    Raises:
        ValueError: If VAPID keys are not configured.
    """
    vapid_private = settings.VAPID_PRIVATE_KEY
    vapid_public = settings.VAPID_PUBLIC_KEY
    vapid_email = settings.VAPID_ADMIN_EMAIL

    if not vapid_private or not vapid_public:
        raise ValueError("VAPID keys are not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.")

    org = channel.organization
    user_ids = org.memberships.values_list("user_id", flat=True)
    subscriptions = PushSubscription.objects.filter(user_id__in=user_ids)

    if not subscriptions.exists():
        logger.info("No push subscriptions found for org %s", org.slug)
        return

    context = _build_alert_context(alert)
    payload = json.dumps({
        "title": f"[{alert.severity}] {alert.get_alert_type_display()}",
        "body": alert.message,
        "data": context,
        "icon": "/pwa-192x192.png",
        "badge": "/pwa-192x192.png",
    })

    vapid_claims = {
        "sub": f"mailto:{vapid_email}",
    }

    failed_endpoints: list[int] = []
    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth,
            },
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
        except WebPushException as exc:
            if exc.response and exc.response.status_code in (404, 410):
                failed_endpoints.append(sub.pk)
                logger.info("Push subscription expired/invalid, removing: %s", sub.endpoint[:60])
            else:
                logger.warning("Push notification failed for %s: %s", sub.endpoint[:60], exc)

    if failed_endpoints:
        PushSubscription.objects.filter(pk__in=failed_endpoints).delete()

    logger.info(
        "Push notifications sent for alert %s to org %s (%d subscriptions)",
        alert.pk,
        org.slug,
        subscriptions.count(),
    )


# Registry mapping channel type to dispatcher function
DISPATCHERS = {
    NotificationChannel.ChannelType.EMAIL: dispatch_email,
    NotificationChannel.ChannelType.WEBHOOK: dispatch_webhook,
    NotificationChannel.ChannelType.TELEGRAM: dispatch_telegram,
    NotificationChannel.ChannelType.PUSH: dispatch_push,
}
