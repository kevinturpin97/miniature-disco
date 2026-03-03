"""Celery tasks for the IoT app.

Includes periodic tasks for relay offline detection and
threshold-based alert generation.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.utils import timezone

from .models import Alert, Sensor, SensorReading, Zone

logger = logging.getLogger(__name__)


@shared_task(name="iot.detect_offline_relays")
def detect_offline_relays() -> dict[str, int]:
    """Detect relay nodes that have gone offline.

    A relay is considered offline if its ``last_seen`` timestamp is older
    than ``2 × transmission_interval`` seconds.  Creates a
    :data:`~Alert.AlertType.RELAY_OFFLINE` alert for each newly-offline zone
    (avoids duplicates by checking for an existing unacknowledged alert).

    Returns:
        Dict with ``checked`` and ``offline`` counts.
    """
    now = timezone.now()
    active_zones = Zone.objects.filter(is_active=True).select_related("greenhouse")

    checked = 0
    offline = 0

    for zone in active_zones:
        checked += 1

        if zone.last_seen is None:
            # Never seen — skip (not yet commissioned)
            continue

        threshold = timedelta(seconds=zone.transmission_interval * 2)
        if (now - zone.last_seen) <= threshold:
            # Still online
            continue

        # Check if an unacknowledged offline alert already exists
        existing = Alert.objects.filter(
            zone=zone,
            alert_type=Alert.AlertType.RELAY_OFFLINE,
            is_acknowledged=False,
        ).exists()

        if existing:
            continue

        alert = Alert.objects.create(
            zone=zone,
            alert_type=Alert.AlertType.RELAY_OFFLINE,
            severity=Alert.Severity.CRITICAL,
            message=(
                f"Relay {zone.relay_id} ({zone.name}) in "
                f"{zone.greenhouse.name} is offline — "
                f"last seen {zone.last_seen.isoformat()}"
            ),
        )
        _push_alert(alert, zone)
        offline += 1
        logger.warning(
            "Relay offline: zone=%s relay_id=%s last_seen=%s",
            zone.pk,
            zone.relay_id,
            zone.last_seen,
        )

    logger.info("Offline detection complete: checked=%d offline=%d", checked, offline)
    return {"checked": checked, "offline": offline}


def _push_alert(alert: Alert, zone: Zone) -> None:
    """Push an alert notification to the WebSocket channel layer.

    Args:
        alert: The persisted Alert instance.
        zone: The zone the alert belongs to.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    owner_id = zone.greenhouse.owner_id
    group_name = f"alerts_{owner_id}"
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": "alert_notification",
            "alert_id": alert.pk,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "zone_id": zone.pk,
            "zone_name": zone.name,
            "message": alert.message,
            "created_at": alert.created_at.isoformat() if alert.created_at else None,
        },
    )


@shared_task(name="iot.evaluate_sensor_thresholds")
def evaluate_sensor_thresholds(reading_id: int) -> dict[str, bool]:
    """Evaluate sensor thresholds for a newly created reading.

    Called after each :class:`~SensorReading` is persisted.  Creates
    :data:`~Alert.AlertType.THRESHOLD_HIGH` or
    :data:`~Alert.AlertType.THRESHOLD_LOW` alerts when the value exceeds
    the configured sensor thresholds.

    Args:
        reading_id: Primary key of the SensorReading to evaluate.

    Returns:
        Dict with ``high`` and ``low`` booleans indicating whether alerts
        were created.
    """
    try:
        reading = (
            SensorReading.objects
            .select_related("sensor", "sensor__zone", "sensor__zone__greenhouse")
            .get(pk=reading_id)
        )
    except SensorReading.DoesNotExist:
        logger.warning("SensorReading %s not found — skipping threshold check", reading_id)
        return {"high": False, "low": False}

    sensor = reading.sensor
    zone = sensor.zone
    value = reading.value
    result = {"high": False, "low": False}

    if sensor.max_threshold is not None and value > sensor.max_threshold:
        alert = Alert.objects.create(
            sensor=sensor,
            zone=zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
            severity=Alert.Severity.WARNING,
            value=value,
            message=(
                f"{sensor.get_sensor_type_display()} in {zone.name} "
                f"is {value} (above threshold {sensor.max_threshold})"
            ),
        )
        _push_alert(alert, zone)
        result["high"] = True
        logger.info(
            "Threshold HIGH alert: sensor=%s value=%s max=%s",
            sensor.pk,
            value,
            sensor.max_threshold,
        )

    if sensor.min_threshold is not None and value < sensor.min_threshold:
        alert = Alert.objects.create(
            sensor=sensor,
            zone=zone,
            alert_type=Alert.AlertType.THRESHOLD_LOW,
            severity=Alert.Severity.WARNING,
            value=value,
            message=(
                f"{sensor.get_sensor_type_display()} in {zone.name} "
                f"is {value} (below threshold {sensor.min_threshold})"
            ),
        )
        _push_alert(alert, zone)
        result["low"] = True
        logger.info(
            "Threshold LOW alert: sensor=%s value=%s min=%s",
            sensor.pk,
            value,
            sensor.min_threshold,
        )

    return result
