"""Celery tasks for the IoT app.

Includes periodic tasks for relay offline detection and
threshold-based alert generation.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
import paho.mqtt.client as mqtt
from django.conf import settings
from django.utils import timezone

from .models import Actuator, Alert, Command, Sensor, SensorReading, Zone

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


def _push_command_status(command: Command, user_id: int) -> None:
    """Push a command status update to the WebSocket channel layer.

    Args:
        command: The persisted Command instance.
        user_id: The owner user ID for the channel group.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    group_name = f"commands_{user_id}"
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": "command_status_update",
            "command_id": command.pk,
            "actuator_id": command.actuator_id,
            "status": command.status,
            "sent_at": command.sent_at.isoformat() if command.sent_at else None,
            "acknowledged_at": command.acknowledged_at.isoformat() if command.acknowledged_at else None,
            "error_message": command.error_message,
        },
    )


@shared_task(name="iot.send_command_to_mqtt")
def send_command_to_mqtt(command_id: int) -> None:
    """Send a command to the LoRa bridge via MQTT.

    Loads the :class:`~Command`, publishes the corresponding MQTT message,
    and updates the command status to SENT on success or FAILED on error.

    Args:
        command_id: Primary key of the Command to send.
    """
    try:
        command = (
            Command.objects
            .select_related("actuator__zone__greenhouse")
            .get(pk=command_id)
        )
    except Command.DoesNotExist:
        logger.warning("Command %s not found — skipping MQTT publish", command_id)
        return

    actuator = command.actuator
    zone = actuator.zone
    user_id = zone.greenhouse.owner_id

    action_map = {"ON": 1, "OFF": 0, "SET": 2}
    action_int = action_map.get(command.command_type, 0)

    payload = {
        "command_id": command.pk,
        "actuator_pin": actuator.gpio_pin or 0,
        "action": action_int,
        "value": int((command.value or 0) * 100),
    }
    topic = f"greenhouse/commands/{zone.relay_id}"

    try:
        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="django-command-publisher",
        )
        client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=10)
        result = client.publish(topic, json.dumps(payload), qos=1)
        result.wait_for_publish(timeout=5)
        client.disconnect()

        command.status = Command.CommandStatus.SENT
        command.sent_at = timezone.now()
        command.save(update_fields=["status", "sent_at"])

        # Update actuator state based on the command type
        if command.command_type == "ON":
            actuator.state = True
        elif command.command_type == "OFF":
            actuator.state = False
        elif command.command_type == "SET":
            actuator.state = True
        actuator.save(update_fields=["state"])

        _push_command_status(command, user_id)
        logger.info("Command %s sent via MQTT to topic=%s", command.pk, topic)

    except Exception as exc:
        command.status = Command.CommandStatus.FAILED
        command.error_message = str(exc)
        command.save(update_fields=["status", "error_message"])
        _push_command_status(command, user_id)
        logger.error("Failed to send command %s via MQTT: %s", command.pk, exc)


@shared_task(name="iot.timeout_pending_commands")
def timeout_pending_commands() -> dict[str, int]:
    """Time out commands that have been pending or sent for too long.

    Commands older than 60 seconds with a status of PENDING or SENT are
    marked as TIMEOUT.  An alert is created for each timed-out command.

    Returns:
        Dict with ``timed_out`` count.
    """
    cutoff = timezone.now() - timedelta(seconds=60)
    stale_commands = (
        Command.objects
        .filter(
            status__in=[Command.CommandStatus.PENDING, Command.CommandStatus.SENT],
            created_at__lt=cutoff,
        )
        .select_related("actuator__zone__greenhouse")
    )

    timed_out = 0
    for command in stale_commands:
        command.status = Command.CommandStatus.TIMEOUT
        command.save(update_fields=["status"])

        zone = command.actuator.zone
        user_id = zone.greenhouse.owner_id

        alert = Alert.objects.create(
            zone=zone,
            alert_type=Alert.AlertType.COMMAND_FAILED,
            severity=Alert.Severity.WARNING,
            message=(
                f"Command {command.command_type} to {command.actuator.name} "
                f"timed out after 60s"
            ),
        )
        _push_alert(alert, zone)
        _push_command_status(command, user_id)
        timed_out += 1

    logger.info("Command timeout check complete: timed_out=%d", timed_out)
    return {"timed_out": timed_out}


@shared_task(name="iot.evaluate_automation_rules")
def evaluate_automation_rules(reading_id: int) -> dict[str, int]:
    """Evaluate automation rules for a newly created sensor reading.

    Delegates to :func:`~automation_engine.evaluate_rules_for_reading`
    which checks matching active rules, respects cooldowns, and creates
    commands when conditions are met.

    Args:
        reading_id: Primary key of the SensorReading to evaluate.

    Returns:
        Dict with ``triggered`` count of rules that fired.
    """
    try:
        reading = (
            SensorReading.objects
            .select_related("sensor", "sensor__zone")
            .get(pk=reading_id)
        )
    except SensorReading.DoesNotExist:
        logger.warning("SensorReading %s not found — skipping automation evaluation", reading_id)
        return {"triggered": 0}

    from .automation_engine import evaluate_rules_for_reading

    command_ids = evaluate_rules_for_reading(reading)
    return {"triggered": len(command_ids)}
