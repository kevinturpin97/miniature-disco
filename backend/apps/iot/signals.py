"""IoT app signals.

Dispatches Celery tasks when sensor readings or alerts are created.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Alert, Command, SensorReading

logger = logging.getLogger(__name__)


def _get_active_crop_cycle(zone_id: int):
    """Return the active crop cycle for a zone, or None."""
    from .models import CropCycle

    return CropCycle.objects.filter(
        zone_id=zone_id, status=CropCycle.Status.ACTIVE
    ).first()


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


# ---------------------------------------------------------------------------
# Sprint 25 — Culture Journal auto-logging signals
# ---------------------------------------------------------------------------


@receiver(post_save, sender=Command)
def log_command_to_culture_journal(
    sender: type,
    instance: Command,
    created: bool,
    **kwargs: object,
) -> None:
    """Create a CultureLog entry when a new command is created.

    Args:
        sender: The Command model class.
        instance: The newly created Command.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .models import CultureLog

    try:
        zone = instance.actuator.zone
    except Exception:
        return

    crop_cycle = _get_active_crop_cycle(zone.pk)
    CultureLog.objects.create(
        zone=zone,
        crop_cycle=crop_cycle,
        entry_type=CultureLog.EntryType.COMMAND,
        summary=f"{instance.get_command_type_display()} command sent to {instance.actuator.name}",
        details={
            "command_id": instance.pk,
            "actuator_id": instance.actuator_id,
            "actuator_name": instance.actuator.name,
            "command_type": instance.command_type,
            "value": instance.value,
        },
        user=instance.created_by,
    )


@receiver(post_save, sender=Alert)
def log_alert_to_culture_journal(
    sender: type,
    instance: Alert,
    created: bool,
    **kwargs: object,
) -> None:
    """Create a CultureLog entry when a new alert is triggered.

    Args:
        sender: The Alert model class.
        instance: The newly created Alert.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .models import CultureLog

    crop_cycle = _get_active_crop_cycle(instance.zone_id)
    CultureLog.objects.create(
        zone=instance.zone,
        crop_cycle=crop_cycle,
        entry_type=CultureLog.EntryType.ALERT,
        summary=f"[{instance.get_severity_display()}] {instance.message[:100]}",
        details={
            "alert_id": instance.pk,
            "alert_type": instance.alert_type,
            "severity": instance.severity,
            "value": instance.value,
            "sensor_id": instance.sensor_id,
        },
    )


@receiver(post_save, sender="iot.Note")
def log_note_to_culture_journal(
    sender: type,
    instance: object,
    created: bool,
    **kwargs: object,
) -> None:
    """Create a CultureLog entry when a manual note is added.

    Args:
        sender: The Note model class.
        instance: The newly created Note.
        created: True if the instance was just created.
    """
    if not created:
        return

    from .models import CultureLog, Note

    note: Note = instance  # type: ignore[assignment]
    crop_cycle = _get_active_crop_cycle(note.zone_id)
    CultureLog.objects.create(
        zone=note.zone,
        crop_cycle=crop_cycle or note.crop_cycle,
        entry_type=CultureLog.EntryType.NOTE,
        summary=f"Note: {note.content[:100]}",
        details={
            "note_id": note.pk,
            "content": note.content,
            "observed_at": note.observed_at.isoformat() if note.observed_at else None,
        },
        user=note.author,
    )


@receiver(post_save, sender="iot.CropCycle")
def log_crop_cycle_to_culture_journal(
    sender: type,
    instance: object,
    created: bool,
    **kwargs: object,
) -> None:
    """Create a CultureLog entry when a crop cycle is created or updated.

    Args:
        sender: The CropCycle model class.
        instance: The CropCycle.
        created: True if the instance was just created.
    """
    from .models import CropCycle, CultureLog

    cc: CropCycle = instance  # type: ignore[assignment]
    action = "started" if created else f"updated (status: {cc.get_status_display()})"
    variety_str = f" ({cc.variety})" if cc.variety else ""
    CultureLog.objects.create(
        zone=cc.zone,
        crop_cycle=cc,
        entry_type=CultureLog.EntryType.CROP_CYCLE,
        summary=f"Crop cycle {action}: {cc.species}{variety_str}",
        details={
            "crop_cycle_id": cc.pk,
            "species": cc.species,
            "variety": cc.variety,
            "status": cc.status,
            "sowing_date": str(cc.sowing_date) if cc.sowing_date else None,
        },
        user=cc.created_by,
    )