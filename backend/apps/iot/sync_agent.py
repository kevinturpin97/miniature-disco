"""Edge Sync Agent — Sprint 27.

Celery tasks that batch-compress-sign and upload local edge data to the
cloud API.  Authentication uses HMAC-SHA256 (no JWT) so that the edge device
can authenticate without an interactive login.

Retry strategy (store-and-forward):
    attempt 0 →  immediate
    attempt 1 →  60 s
    attempt 2 →  5 min
    attempt 3 →  15 min
    attempt 4+→  1 h
"""

from __future__ import annotations

import gzip
import hashlib
import hmac
import json
import logging
from datetime import timedelta
from typing import Any

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import (
    Alert,
    AuditEvent,
    Command,
    EdgeDevice,
    SensorReading,
    SyncBatch,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_RETRY_DELAYS: list[int] = getattr(settings, "CLOUD_SYNC_RETRY_DELAYS", [60, 300, 900, 3600])


def _build_hmac_headers(device: EdgeDevice, body: bytes) -> dict[str, str]:
    """Return HTTP headers with HMAC-SHA256 signature over the request body.

    The cloud side must verify:
        HMAC-SHA256(secret_key, body) == X-Signature header
    """
    sig = hmac.new(device.secret_key.encode(), body, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "X-Device-ID": str(device.device_id),
        "X-Signature": sig,
    }


def _collect_unsynced_readings(batch_size: int) -> tuple[list[dict[str, Any]], list[int]]:
    """Return up to ``batch_size`` unsynced SensorReading records as dicts."""
    qs = SensorReading.objects.filter(cloud_synced=False).select_related("sensor").order_by("received_at")[:batch_size]
    rows = list(qs)
    ids = [r.id for r in rows]
    data = [
        {
            "id": r.id,
            "sensor_id": r.sensor_id,
            "sensor_type": r.sensor.sensor_type,
            "value": r.value,
            "relay_timestamp": r.relay_timestamp.isoformat() if r.relay_timestamp else None,
            "received_at": r.received_at.isoformat(),
        }
        for r in rows
    ]
    return data, ids


def _collect_unsynced_commands(batch_size: int) -> tuple[list[dict], list[int]]:
    """Return up to ``batch_size`` unsynced Command records as dicts."""
    rows = list(Command.objects.filter(cloud_synced=False).order_by("created_at")[:batch_size])
    ids = [c.id for c in rows]
    data = [
        {
            "id": c.id,
            "actuator_id": c.actuator_id,
            "command_type": c.command_type,
            "value": c.value,
            "status": c.status,
            "created_at": c.created_at.isoformat(),
            "sent_at": c.sent_at.isoformat() if c.sent_at else None,
            "acknowledged_at": c.acknowledged_at.isoformat() if c.acknowledged_at else None,
        }
        for c in rows
    ]
    return data, ids


def _collect_unsynced_alerts(batch_size: int) -> tuple[list[dict], list[int]]:
    """Return up to ``batch_size`` unsynced Alert records as dicts."""
    rows = list(Alert.objects.filter(cloud_synced=False).order_by("created_at")[:batch_size])
    ids = [a.id for a in rows]
    data = [
        {
            "id": a.id,
            "zone_id": a.zone_id,
            "sensor_id": a.sensor_id,
            "alert_type": a.alert_type,
            "severity": a.severity,
            "value": a.value,
            "message": a.message,
            "is_acknowledged": a.is_acknowledged,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]
    return data, ids


def _collect_unsynced_audit_events(batch_size: int) -> tuple[list[dict], list[int]]:
    """Return up to ``batch_size`` unsynced AuditEvent records as dicts."""
    rows = list(AuditEvent.objects.filter(cloud_synced=False).order_by("created_at")[:batch_size])
    ids = [e.id for e in rows]
    data = [
        {
            "id": e.id,
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_id": e.resource_id,
            "description": e.description,
            "ip_address": str(e.ip_address) if e.ip_address else None,
            "created_at": e.created_at.isoformat(),
        }
        for e in rows
    ]
    return data, ids


def _mark_synced(model_cls: type, ids: list[int]) -> None:
    """Bulk-mark records as cloud-synced."""
    if ids:
        model_cls.objects.filter(pk__in=ids).update(
            cloud_synced=True,
            cloud_synced_at=timezone.now(),
        )


def _get_retry_delay(retry_count: int) -> int:
    """Return the next retry delay in seconds based on attempt number."""
    if retry_count < len(_RETRY_DELAYS):
        return _RETRY_DELAYS[retry_count]
    return _RETRY_DELAYS[-1]


# ---------------------------------------------------------------------------
# Core sync function
# ---------------------------------------------------------------------------


def _run_sync(edge_device: EdgeDevice, batch_size: int | None = None) -> dict[str, Any]:
    """Execute one sync cycle for a given edge device.

    Collects unsynced records, compresses the payload with gzip, signs it with
    HMAC-SHA256, and POSTs it to the cloud API.

    Returns a summary dict suitable for logging / tests.
    """
    if not settings.CLOUD_SYNC_URL:
        logger.debug("CLOUD_SYNC_URL not configured — skipping sync for %s", edge_device.name)
        return {"skipped": True, "reason": "CLOUD_SYNC_URL not configured"}

    if batch_size is None:
        batch_size = getattr(settings, "CLOUD_SYNC_BATCH_SIZE", 500)

    # Collect data
    readings, reading_ids = _collect_unsynced_readings(batch_size)
    commands, command_ids = _collect_unsynced_commands(batch_size)
    alerts, alert_ids = _collect_unsynced_alerts(batch_size)
    audit_events, audit_ids = _collect_unsynced_audit_events(batch_size)

    total = len(reading_ids) + len(command_ids) + len(alert_ids) + len(audit_ids)

    if total == 0:
        logger.debug("Nothing to sync for device %s", edge_device.name)
        return {"records_synced": 0, "skipped": False}

    # Build payload
    payload: dict[str, Any] = {
        "device_id": str(edge_device.device_id),
        "firmware_version": edge_device.firmware_version,
        "synced_at": timezone.now().isoformat(),
        "readings": readings,
        "commands": commands,
        "alerts": alerts,
        "audit_events": audit_events,
    }
    raw_body = json.dumps(payload, separators=(",", ":")).encode()
    compressed_body = gzip.compress(raw_body, compresslevel=6)
    payload_kb = len(compressed_body) / 1024

    # Create SyncBatch record
    batch = SyncBatch.objects.create(
        edge_device=edge_device,
        status=SyncBatch.Status.PENDING,
        records_count=total,
        payload_size_kb=round(payload_kb, 2),
    )

    # Sign and send
    headers = _build_hmac_headers(edge_device, compressed_body)
    timeout = getattr(settings, "CLOUD_SYNC_TIMEOUT", 30)
    sync_url = settings.CLOUD_SYNC_URL.rstrip("/") + "/api/edge/sync/"

    try:
        response = requests.post(sync_url, data=compressed_body, headers=headers, timeout=timeout)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Sync failed for device %s: %s", edge_device.name, exc)
        delay = _get_retry_delay(batch.retry_count)
        batch.status = SyncBatch.Status.RETRY
        batch.retry_count += 1
        batch.error_message = str(exc)
        batch.next_retry_at = timezone.now() + timedelta(seconds=delay)
        batch.save(update_fields=["status", "retry_count", "error_message", "next_retry_at"])
        return {
            "records_synced": 0,
            "error": str(exc),
            "next_retry_at": batch.next_retry_at.isoformat(),
        }

    # Success — mark records synced
    _mark_synced(SensorReading, reading_ids)
    _mark_synced(Command, command_ids)
    _mark_synced(Alert, alert_ids)
    _mark_synced(AuditEvent, audit_ids)

    batch.status = SyncBatch.Status.SUCCESS
    batch.completed_at = timezone.now()
    batch.save(update_fields=["status", "completed_at"])

    edge_device.last_sync_at = timezone.now()
    edge_device.save(update_fields=["last_sync_at"])

    logger.info(
        "Sync complete for device %s: %d records (%.1f KB compressed)",
        edge_device.name,
        total,
        payload_kb,
    )
    return {
        "records_synced": total,
        "payload_kb": round(payload_kb, 2),
        "batch_id": batch.id,
    }


# ---------------------------------------------------------------------------
# Celery tasks
# ---------------------------------------------------------------------------


@shared_task(name="iot.sync_to_cloud")
def sync_to_cloud() -> dict[str, Any]:
    """Sync unsynced records to the cloud for all active edge devices.

    Scheduled every 5 minutes via Celery beat (see celery.py).
    """
    if not settings.EDGE_MODE:
        return {"skipped": True, "reason": "Not in edge mode"}

    devices = EdgeDevice.objects.filter(is_active=True)
    results: dict[str, Any] = {}
    for device in devices:
        try:
            results[str(device.device_id)] = _run_sync(device)
        except Exception as exc:
            logger.exception("Unexpected error during sync for device %s: %s", device.name, exc)
            results[str(device.device_id)] = {"error": str(exc)}
    return results


@shared_task(name="iot.bulk_sync_to_cloud")
def bulk_sync_to_cloud() -> dict[str, Any]:
    """Nightly bulk sync — larger batch size, runs all pending retries too.

    Scheduled at 2:00 AM via Celery beat (see celery.py).
    """
    if not settings.EDGE_MODE:
        return {"skipped": True, "reason": "Not in edge mode"}

    # First process any pending retries
    now = timezone.now()
    retryable = SyncBatch.objects.filter(
        status=SyncBatch.Status.RETRY,
        next_retry_at__lte=now,
        edge_device__is_active=True,
    ).select_related("edge_device")

    devices_to_sync: set[int] = set()
    for batch in retryable:
        devices_to_sync.add(batch.edge_device_id)

    # Also sync all active devices with a large batch size
    devices = EdgeDevice.objects.filter(is_active=True)
    results: dict[str, Any] = {}
    for device in devices:
        try:
            results[str(device.device_id)] = _run_sync(device, batch_size=5000)
        except Exception as exc:
            logger.exception("Bulk sync error for device %s: %s", device.name, exc)
            results[str(device.device_id)] = {"error": str(exc)}
    return results


@shared_task(name="iot.retry_failed_syncs")
def retry_failed_syncs() -> dict[str, Any]:
    """Process sync batches that are due for retry.

    Runs every minute to pick up batches whose ``next_retry_at`` has passed.
    """
    if not settings.EDGE_MODE:
        return {"skipped": True, "reason": "Not in edge mode"}

    now = timezone.now()
    retryable = SyncBatch.objects.filter(
        status=SyncBatch.Status.RETRY,
        next_retry_at__lte=now,
        edge_device__is_active=True,
    ).select_related("edge_device").distinct("edge_device_id")

    results: dict[str, Any] = {}
    for batch in retryable:
        device = batch.edge_device
        try:
            results[str(device.device_id)] = _run_sync(device)
        except Exception as exc:
            logger.exception("Retry sync error for device %s: %s", device.name, exc)
            results[str(device.device_id)] = {"error": str(exc)}
    return results
