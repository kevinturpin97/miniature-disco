"""Celery tasks for webhook delivery and API key logging."""

import hashlib
import hmac
import json
import logging
import time

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import APIKeyLog, Webhook, WebhookDelivery

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def deliver_webhook(self, webhook_id: int, event_type: str, payload: dict) -> None:
    """Deliver a single webhook event to its configured URL.

    Loads the webhook from the database, validates it is active and under
    the failure threshold, builds the request (with optional HMAC-SHA256
    signature), performs the HTTP POST, and records a WebhookDelivery.

    Args:
        webhook_id: Primary key of the Webhook to deliver to.
        event_type: The event type string (e.g. "new_reading").
        payload: The JSON-serializable event payload dict.
    """
    try:
        webhook = Webhook.objects.select_related("organization").get(id=webhook_id)
    except Webhook.DoesNotExist:
        logger.warning("Webhook id=%s not found, skipping delivery.", webhook_id)
        return

    if not webhook.is_active:
        logger.info("Webhook id=%s is inactive, skipping delivery.", webhook_id)
        return

    if webhook.failure_count >= settings.WEBHOOK_MAX_FAILURES:
        logger.warning(
            "Webhook id=%s reached max failures (%d), deactivating.",
            webhook_id,
            settings.WEBHOOK_MAX_FAILURES,
        )
        webhook.is_active = False
        webhook.save(update_fields=["is_active", "updated_at"])
        return

    body = json.dumps(payload, default=str)

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Event": event_type,
    }

    if webhook.secret:
        signature = hmac.new(
            webhook.secret.encode("utf-8"),
            body.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        headers["X-Webhook-Signature"] = signature

    start_time = time.monotonic()
    try:
        response = requests.post(
            webhook.url,
            data=body,
            headers=headers,
            timeout=settings.WEBHOOK_TIMEOUT_SECONDS,
        )
        duration_ms = int((time.monotonic() - start_time) * 1000)

        if response.ok:
            WebhookDelivery.objects.create(
                webhook=webhook,
                event_type=event_type,
                payload=payload,
                response_status=response.status_code,
                response_body=response.text[:2000],
                status=WebhookDelivery.Status.SUCCESS,
                duration_ms=duration_ms,
            )
            webhook.failure_count = 0
            webhook.last_triggered_at = timezone.now()
            webhook.save(update_fields=["failure_count", "last_triggered_at", "updated_at"])
            logger.info(
                "Webhook id=%s delivered successfully (status=%d, %dms).",
                webhook_id,
                response.status_code,
                duration_ms,
            )
        else:
            WebhookDelivery.objects.create(
                webhook=webhook,
                event_type=event_type,
                payload=payload,
                response_status=response.status_code,
                response_body=response.text[:2000],
                status=WebhookDelivery.Status.FAILED,
                error_message=f"HTTP {response.status_code}",
                duration_ms=duration_ms,
            )
            webhook.failure_count += 1
            webhook.save(update_fields=["failure_count", "updated_at"])
            logger.warning(
                "Webhook id=%s delivery failed (status=%d, failures=%d).",
                webhook_id,
                response.status_code,
                webhook.failure_count,
            )

    except requests.RequestException as exc:
        duration_ms = int((time.monotonic() - start_time) * 1000)
        WebhookDelivery.objects.create(
            webhook=webhook,
            event_type=event_type,
            payload=payload,
            status=WebhookDelivery.Status.FAILED,
            error_message=str(exc)[:2000],
            duration_ms=duration_ms,
        )
        webhook.failure_count += 1
        webhook.save(update_fields=["failure_count", "updated_at"])
        logger.error(
            "Webhook id=%s delivery raised exception (failures=%d): %s",
            webhook_id,
            webhook.failure_count,
            exc,
        )


@shared_task
def dispatch_webhooks(event_type: str, payload: dict, organization_id: int) -> None:
    """Dispatch an event to all matching webhooks for an organization.

    Finds all active webhooks belonging to the given organization that
    subscribe to the specified event type, and enqueues a deliver_webhook
    task for each one.

    Args:
        event_type: The event type string (e.g. "new_reading").
        payload: The JSON-serializable event payload dict.
        organization_id: Primary key of the Organization that owns the webhooks.
    """
    webhooks = Webhook.objects.filter(
        organization_id=organization_id,
        is_active=True,
        events__contains=[event_type],
    )

    count = 0
    for webhook in webhooks:
        deliver_webhook.delay(webhook.id, event_type, payload)
        count += 1

    logger.info(
        "Dispatched event '%s' to %d webhook(s) for organization_id=%s.",
        event_type,
        count,
        organization_id,
    )


@shared_task
def log_api_key_call(
    api_key_id: int,
    method: str,
    path: str,
    status_code: int,
    ip_address: str | None,
    user_agent: str,
) -> None:
    """Log an API call made with an API key.

    Creates an APIKeyLog record capturing the request metadata for
    auditing and usage tracking purposes.

    Args:
        api_key_id: Primary key of the APIKey that was used.
        method: HTTP method (e.g. "GET", "POST").
        path: Request path (e.g. "/api/v1/zones/").
        status_code: HTTP response status code.
        ip_address: Client IP address, or None if unavailable.
        user_agent: Client User-Agent header value.
    """
    APIKeyLog.objects.create(
        api_key_id=api_key_id,
        method=method,
        path=path,
        status_code=status_code,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    logger.debug(
        "Logged API key call: key_id=%s %s %s → %d",
        api_key_id,
        method,
        path,
        status_code,
    )
