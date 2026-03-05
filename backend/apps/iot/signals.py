"""IoT app signals.

Dispatches Celery tasks when sensor readings or alerts are created.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Alert, Command, SensorReading

logger = logging.getLogger(__name__)


@receiver(post_save, sender=SensorReading)
def trigger_threshold_evaluation(
    sender: type,
    instance: SensorReading,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch the threshold evaluation Celery task for new readings.

    Args:
        sender: The SensorReading model class.
        instance: The newly created SensorReading.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .tasks import evaluate_sensor_thresholds

    evaluate_sensor_thresholds.delay(instance.pk)


@receiver(post_save, sender=SensorReading)
def trigger_automation_evaluation(
    sender: type,
    instance: SensorReading,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch the automation rules evaluation Celery task for new readings.

    Args:
        sender: The SensorReading model class.
        instance: The newly created SensorReading.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .tasks import evaluate_automation_rules

    evaluate_automation_rules.delay(instance.pk)


@receiver(post_save, sender=Command)
def trigger_send_command_to_mqtt(
    sender: type,
    instance: Command,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch the send_command_to_mqtt Celery task for new commands.

    Args:
        sender: The Command model class.
        instance: The newly created Command.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .tasks import send_command_to_mqtt

    send_command_to_mqtt.delay(instance.pk)


@receiver(post_save, sender=Alert)
def trigger_notification_dispatch(
    sender: type,
    instance: Alert,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch notifications for newly created alerts.

    Args:
        sender: The Alert model class.
        instance: The newly created Alert.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .tasks import dispatch_notifications

    dispatch_notifications.delay(instance.pk)


@receiver(post_save, sender=SensorReading)
def trigger_anomaly_detection(
    sender: type,
    instance: SensorReading,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch the anomaly detection Celery task for new readings.

    Args:
        sender: The SensorReading model class.
        instance: The newly created SensorReading.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .tasks import detect_anomalies_task

    detect_anomalies_task.delay(instance.pk)


@receiver(post_save, sender=SensorReading)
def trigger_ml_anomaly_detection(
    sender: type,
    instance: SensorReading,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch the ML-based anomaly detection Celery task for new readings.

    Args:
        sender: The SensorReading model class.
        instance: The newly created SensorReading.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .tasks import detect_anomaly_ml_task

    detect_anomaly_ml_task.delay(instance.pk)


@receiver(post_save, sender=SensorReading)
def trigger_webhook_new_reading(
    sender: type,
    instance: SensorReading,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch webhook for new sensor readings.

    Args:
        sender: The SensorReading model class.
        instance: The newly created SensorReading.
        created: True if the instance was just created.
    """
    if not created:
        return

    payload = {
        "event": "new_reading",
        "sensor_id": instance.sensor_id,
        "value": instance.value,
        "received_at": instance.received_at.isoformat(),
    }

    try:
        organization_id = instance.sensor.zone.greenhouse.organization_id
    except Exception:
        logger.warning(
            "Could not resolve organization for SensorReading %s, skipping webhook dispatch.",
            instance.pk,
        )
        return

    if organization_id is not None:
        from apps.api.tasks import dispatch_webhooks

        dispatch_webhooks.delay("new_reading", payload, organization_id)


@receiver(post_save, sender=Alert)
def trigger_webhook_alert_created(
    sender: type,
    instance: Alert,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch webhook when a new alert is created.

    Args:
        sender: The Alert model class.
        instance: The newly created Alert.
        created: True if the instance was just created.
    """
    if not created:
        return

    payload = {
        "event": "alert_created",
        "alert_id": instance.pk,
        "zone_id": instance.zone_id,
        "alert_type": instance.alert_type,
        "severity": instance.severity,
        "message": instance.message,
        "created_at": instance.created_at.isoformat(),
    }

    try:
        organization_id = instance.zone.greenhouse.organization_id
    except Exception:
        logger.warning(
            "Could not resolve organization for Alert %s, skipping webhook dispatch.",
            instance.pk,
        )
        return

    if organization_id is not None:
        from apps.api.tasks import dispatch_webhooks

        dispatch_webhooks.delay("alert_created", payload, organization_id)


@receiver(post_save, sender=Command)
def trigger_webhook_command_ack(
    sender: type,
    instance: Command,
    created: bool,
    **kwargs: object,
) -> None:
    """Dispatch webhook when a command is acknowledged.

    Args:
        sender: The Command model class.
        instance: The Command that was saved.
        created: True if the instance was just created.
    """
    if created:
        return

    if instance.status != "ACK":
        return

    payload = {
        "event": "command_ack",
        "command_id": instance.pk,
        "actuator_id": instance.actuator_id,
        "command_type": instance.command_type,
        "status": instance.status,
        "acknowledged_at": instance.acknowledged_at.isoformat() if instance.acknowledged_at else None,
    }

    try:
        organization_id = instance.actuator.zone.greenhouse.organization_id
    except Exception:
        logger.warning(
            "Could not resolve organization for Command %s, skipping webhook dispatch.",
            instance.pk,
        )
        return

    if organization_id is not None:
        from apps.api.tasks import dispatch_webhooks

        dispatch_webhooks.delay("command_ack", payload, organization_id)