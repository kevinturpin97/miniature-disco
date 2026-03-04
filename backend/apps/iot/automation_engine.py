"""IoT app automation engine.

Evaluates active automation rules against sensor readings and creates
commands when conditions are met, respecting cooldown periods.
"""

from __future__ import annotations

import logging
import operator
from datetime import timedelta

from django.utils import timezone

from .models import AutomationRule, Command, SensorReading

logger = logging.getLogger(__name__)

CONDITION_OPS: dict[str, operator] = {
    "GT": operator.gt,
    "LT": operator.lt,
    "EQ": operator.eq,
    "GTE": operator.ge,
    "LTE": operator.le,
}


def evaluate_rules_for_reading(reading: SensorReading) -> list[int]:
    """Evaluate all active automation rules for a given sensor reading.

    Finds rules matching the reading's zone and sensor type, checks
    the condition against the threshold, respects cooldown, and creates
    a Command when triggered.

    Args:
        reading: The newly created SensorReading instance.

    Returns:
        List of Command IDs created by triggered rules.
    """
    sensor = reading.sensor
    zone = sensor.zone
    now = timezone.now()

    rules = AutomationRule.objects.filter(
        zone=zone,
        sensor_type=sensor.sensor_type,
        is_active=True,
    ).select_related("action_actuator")

    triggered_command_ids: list[int] = []

    for rule in rules:
        op_func = CONDITION_OPS.get(rule.condition)
        if op_func is None:
            logger.warning(
                "Unknown condition %r on rule %s — skipping",
                rule.condition,
                rule.pk,
            )
            continue

        if not op_func(reading.value, rule.threshold_value):
            continue

        # Cooldown check
        if rule.last_triggered is not None:
            cooldown_delta = timedelta(seconds=rule.cooldown_seconds)
            if (now - rule.last_triggered) < cooldown_delta:
                logger.debug(
                    "Rule %s in cooldown (last_triggered=%s, cooldown=%ss) — skipping",
                    rule.pk,
                    rule.last_triggered,
                    rule.cooldown_seconds,
                )
                continue

        # Create command for the actuator
        command = Command.objects.create(
            actuator=rule.action_actuator,
            command_type=rule.action_command_type,
            value=rule.action_value,
            automation_rule=rule,
        )

        # Update last_triggered
        rule.last_triggered = now
        rule.save(update_fields=["last_triggered"])

        triggered_command_ids.append(command.pk)
        logger.info(
            "Automation rule %s triggered: created command %s "
            "(actuator=%s, action=%s, value=%s)",
            rule.pk,
            command.pk,
            rule.action_actuator_id,
            rule.action_command_type,
            rule.action_value,
        )

    return triggered_command_ids
