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
