"""IoT app signals.

Dispatches Celery tasks when sensor readings are created.
"""

from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import SensorReading

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
