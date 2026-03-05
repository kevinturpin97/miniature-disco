"""Celery tasks for the IoT app.

Includes periodic tasks for relay offline detection,
threshold-based alert generation, and notification dispatch.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta, timezone

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
import paho.mqtt.client as mqtt
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from .models import (
    Actuator,
    Alert,
    Command,
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    Sensor,
    SensorReading,
    SensorReadingHourly,
    Zone,
)

# Sprint 20 imports (deferred in functions to avoid circular imports)

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


@shared_task(name="iot.dispatch_notifications")
def dispatch_notifications(alert_id: int) -> dict[str, int]:
    """Dispatch notifications for a newly created alert.

    Finds all active NotificationRules whose organization matches the
    alert's zone→greenhouse→organization.  Respects cooldown, filters
    by alert_type and severity, then calls the appropriate dispatcher.

    Args:
        alert_id: Primary key of the Alert to notify about.

    Returns:
        Dict with ``sent`` and ``failed`` counts.
    """
    try:
        alert = (
            Alert.objects
            .select_related("zone__greenhouse__organization", "sensor")
            .get(pk=alert_id)
        )
    except Alert.DoesNotExist:
        logger.warning("Alert %s not found — skipping notification dispatch", alert_id)
        return {"sent": 0, "failed": 0}

    org = alert.zone.greenhouse.organization
    if org is None:
        return {"sent": 0, "failed": 0}

    rules = (
        NotificationRule.objects
        .filter(organization=org, is_active=True, channel__is_active=True)
        .select_related("channel")
    )

    from .notification_dispatchers import DISPATCHERS

    now = timezone.now()
    sent = 0
    failed = 0

    for rule in rules:
        # Filter by alert type
        if rule.alert_types and alert.alert_type not in rule.alert_types:
            continue

        # Filter by severity
        if rule.severities and alert.severity not in rule.severities:
            continue

        # Cooldown check
        if rule.last_notified:
            cooldown = timedelta(seconds=rule.cooldown_seconds)
            if (now - rule.last_notified) < cooldown:
                logger.debug(
                    "Skipping rule %s — cooldown not elapsed (%ss)",
                    rule.pk,
                    rule.cooldown_seconds,
                )
                continue

        dispatcher = DISPATCHERS.get(rule.channel.channel_type)
        if not dispatcher:
            logger.warning("No dispatcher for channel type %s", rule.channel.channel_type)
            continue

        try:
            dispatcher(alert, rule.channel)
            rule.last_notified = now
            rule.save(update_fields=["last_notified"])
            NotificationLog.objects.create(
                rule=rule,
                channel=rule.channel,
                alert=alert,
                status=NotificationLog.Status.SENT,
            )
            sent += 1
        except Exception as exc:
            NotificationLog.objects.create(
                rule=rule,
                channel=rule.channel,
                alert=alert,
                status=NotificationLog.Status.FAILED,
                error_message=str(exc),
            )
            failed += 1
            logger.error(
                "Notification dispatch failed: rule=%s channel=%s error=%s",
                rule.pk,
                rule.channel.pk,
                exc,
            )

    logger.info(
        "Notification dispatch for alert %s: sent=%d failed=%d",
        alert_id,
        sent,
        failed,
    )
    return {"sent": sent, "failed": failed}


@shared_task(name="iot.send_daily_digest")
def send_daily_digest() -> dict[str, int]:
    """Send daily digest emails summarizing unacknowledged alerts.

    Iterates over all organizations that have at least one EMAIL
    notification channel and sends a summary of unacknowledged alerts
    from the last 24 hours.

    Returns:
        Dict with ``organizations`` and ``emails_sent`` counts.
    """
    from apps.api.models import Organization

    now = timezone.now()
    since = now - timedelta(hours=24)
    orgs_notified = 0
    emails_sent = 0

    # Find all orgs with active EMAIL channels
    org_ids = (
        NotificationChannel.objects
        .filter(channel_type=NotificationChannel.ChannelType.EMAIL, is_active=True)
        .values_list("organization_id", flat=True)
        .distinct()
    )

    for org in Organization.objects.filter(pk__in=org_ids):
        alerts = (
            Alert.objects
            .filter(
                zone__greenhouse__organization=org,
                is_acknowledged=False,
                created_at__gte=since,
            )
            .select_related("zone")
            .order_by("-created_at")[:50]
        )

        alert_count = alerts.count()
        if alert_count == 0:
            continue

        # Collect all EMAIL channel recipients for this org
        channels = NotificationChannel.objects.filter(
            organization=org,
            channel_type=NotificationChannel.ChannelType.EMAIL,
            is_active=True,
        )

        all_recipients: set[str] = set()
        for ch in channels:
            for addr in ch.email_recipients.split(","):
                addr = addr.strip()
                if addr:
                    all_recipients.add(addr)

        if not all_recipients:
            continue

        context = {
            "organization_name": org.name,
            "date": now.strftime("%Y-%m-%d"),
            "alert_count": alert_count,
            "alerts": list(alerts),
        }
        html_body = render_to_string("notifications/daily_digest_email.html", context)
        text_body = strip_tags(html_body)

        try:
            send_mail(
                subject=f"[Greenhouse] Daily Alert Digest — {org.name} ({alert_count} alert{'s' if alert_count != 1 else ''})",
                message=text_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=list(all_recipients),
                html_message=html_body,
                fail_silently=False,
            )
            emails_sent += 1
            orgs_notified += 1
            logger.info("Daily digest sent for org %s to %d recipients", org.slug, len(all_recipients))
        except Exception as exc:
            logger.error("Failed to send daily digest for org %s: %s", org.slug, exc)

    logger.info("Daily digest complete: orgs=%d emails=%d", orgs_notified, emails_sent)
    return {"organizations": orgs_notified, "emails_sent": emails_sent}


@shared_task(name="iot.aggregate_hourly_readings")
def aggregate_hourly_readings_task() -> dict[str, int]:
    """Aggregate raw sensor readings into hourly buckets.

    Runs periodically via Celery beat to maintain the
    ``SensorReadingHourly`` materialized aggregation table.

    Returns:
        Dict with ``sensors_processed`` and ``buckets_created`` counts.
    """
    from .analytics import aggregate_hourly_readings

    result = aggregate_hourly_readings()
    logger.info(
        "Hourly aggregation complete: sensors=%d buckets=%d",
        result["sensors_processed"],
        result["buckets_created"],
    )
    return result


@shared_task(name="iot.detect_anomalies")
def detect_anomalies_task(reading_id: int) -> dict[str, bool]:
    """Detect anomalous sensor readings using z-score analysis.

    Called after each SensorReading is persisted, alongside
    threshold evaluation and automation rules.

    Args:
        reading_id: Primary key of the SensorReading to evaluate.

    Returns:
        Dict with ``anomaly`` boolean.
    """
    try:
        reading = (
            SensorReading.objects
            .select_related("sensor", "sensor__zone")
            .get(pk=reading_id)
        )
    except SensorReading.DoesNotExist:
        logger.warning("SensorReading %s not found — skipping anomaly detection", reading_id)
        return {"anomaly": False}

    from .analytics import detect_anomalies

    is_anomaly = detect_anomalies(reading)
    if is_anomaly:
        logger.info("Anomaly detected: reading=%s sensor=%s", reading_id, reading.sensor_id)
    return {"anomaly": is_anomaly}


@shared_task(name="iot.execute_scenario")
def execute_scenario_task(scenario_id: int, user_id: int | None = None) -> dict[str, str]:
    """Execute a scenario by creating commands for each step in order.

    Sets the scenario status to RUNNING, iterates steps sorted by order,
    creates Command objects (respecting delay_seconds via ``countdown``),
    and marks the scenario as COMPLETED or FAILED.

    Args:
        scenario_id: Primary key of the Scenario to execute.
        user_id: Optional user ID to assign as command creator.

    Returns:
        Dict with ``status`` and ``commands_created`` count.
    """
    from .models import Scenario, ScenarioStep

    try:
        scenario = Scenario.objects.select_related("zone").get(pk=scenario_id)
    except Scenario.DoesNotExist:
        logger.warning("Scenario %s not found", scenario_id)
        return {"status": "not_found", "commands_created": 0}

    scenario.status = Scenario.Status.RUNNING
    scenario.save(update_fields=["status"])

    steps = scenario.steps.select_related("actuator").order_by("order")
    commands_created = 0

    try:
        for step in steps:
            # If delay, schedule the command creation with countdown
            if step.delay_seconds > 0:
                _execute_scenario_step.apply_async(
                    args=[step.pk, user_id],
                    countdown=step.delay_seconds,
                )
            else:
                _create_step_command(step, user_id)
            commands_created += 1

            # If duration_seconds is set, schedule a reverse command
            if step.duration_seconds:
                reverse_action = "OFF" if step.action in ("ON", "SET") else "ON"
                total_delay = step.delay_seconds + step.duration_seconds
                _execute_reverse_step.apply_async(
                    args=[step.actuator_id, reverse_action, user_id],
                    countdown=total_delay,
                )

        scenario.status = Scenario.Status.COMPLETED
        scenario.last_run_at = timezone.now()
        scenario.save(update_fields=["status", "last_run_at"])
        logger.info("Scenario %s completed: %d commands created", scenario_id, commands_created)

    except Exception as exc:
        scenario.status = Scenario.Status.FAILED
        scenario.save(update_fields=["status"])
        logger.error("Scenario %s failed: %s", scenario_id, exc)
        return {"status": "failed", "commands_created": commands_created}

    return {"status": "completed", "commands_created": commands_created}


def _create_step_command(step, user_id: int | None = None) -> Command:
    """Create a Command from a ScenarioStep.

    Args:
        step: The ScenarioStep instance.
        user_id: Optional user ID for command creator.

    Returns:
        The created Command.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = None
    if user_id:
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            pass

    return Command.objects.create(
        actuator=step.actuator,
        command_type=step.action,
        value=step.action_value,
        created_by=user,
    )


@shared_task(name="iot.execute_scenario_step")
def _execute_scenario_step(step_id: int, user_id: int | None = None) -> None:
    """Execute a single delayed scenario step by creating its command.

    Args:
        step_id: Primary key of the ScenarioStep to execute.
        user_id: Optional user ID for command creator.
    """
    from .models import ScenarioStep

    try:
        step = ScenarioStep.objects.select_related("actuator").get(pk=step_id)
    except ScenarioStep.DoesNotExist:
        logger.warning("ScenarioStep %s not found", step_id)
        return
    _create_step_command(step, user_id)


@shared_task(name="iot.execute_reverse_step")
def _execute_reverse_step(actuator_id: int, action: str, user_id: int | None = None) -> None:
    """Execute the reverse action of a step after its duration expires.

    Args:
        actuator_id: Primary key of the Actuator to control.
        action: The reverse action (ON or OFF).
        user_id: Optional user ID for command creator.
    """
    from django.contrib.auth import get_user_model

    try:
        actuator = Actuator.objects.get(pk=actuator_id)
    except Actuator.DoesNotExist:
        logger.warning("Actuator %s not found for reverse step", actuator_id)
        return

    User = get_user_model()
    user = None
    if user_id:
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            pass

    Command.objects.create(
        actuator=actuator,
        command_type=action,
        created_by=user,
    )


@shared_task(name="iot.check_schedules")
def check_schedules_task() -> dict[str, int]:
    """Check all active schedules and trigger matching scenarios.

    Runs every minute via Celery beat. For CRON schedules, matches
    against current time. For TIME_RANGE schedules, triggers at
    start_time on matching days.

    Returns:
        Dict with ``checked`` and ``triggered`` counts.
    """
    import datetime as dt

    from .models import Schedule, Scenario

    now = timezone.now()
    current_minute = now.minute
    current_hour = now.hour
    current_dow = now.weekday()  # 0=Monday

    schedules = (
        Schedule.objects
        .filter(is_active=True, scenario__is_active=True)
        .exclude(scenario__status=Scenario.Status.RUNNING)
        .select_related("scenario")
    )

    checked = 0
    triggered = 0

    for sched in schedules:
        checked += 1

        if sched.schedule_type == Schedule.ScheduleType.CRON:
            if not _cron_matches(sched.cron_minute, current_minute):
                continue
            if not _cron_matches(sched.cron_hour, current_hour):
                continue
            if not _cron_matches(sched.cron_day_of_week, current_dow):
                continue

        elif sched.schedule_type == Schedule.ScheduleType.TIME_RANGE:
            if sched.days_of_week and current_dow not in sched.days_of_week:
                continue
            if not sched.start_time:
                continue
            # Only trigger at exact start_time (minute-level matching)
            if sched.start_time.hour != current_hour or sched.start_time.minute != current_minute:
                continue

        else:
            continue

        # Avoid re-triggering within the same minute
        if sched.last_run_at and (now - sched.last_run_at).total_seconds() < 60:
            continue

        execute_scenario_task.delay(sched.scenario_id)
        sched.last_run_at = now
        sched.save(update_fields=["last_run_at"])
        triggered += 1
        logger.info("Schedule %s triggered scenario %s", sched.pk, sched.scenario_id)

    logger.info("Schedule check complete: checked=%d triggered=%d", checked, triggered)
    return {"checked": checked, "triggered": triggered}


def _cron_matches(field: str, value: int) -> bool:
    """Check if a cron field matches a given value.

    Supports '*', single values, and comma-separated lists.

    Args:
        field: The cron field string (e.g., '0', '*', '1,3,5').
        value: The current time component to match against.

    Returns:
        True if the field matches the value.
    """
    field = field.strip()
    if field == "*":
        return True
    parts = [p.strip() for p in field.split(",")]
    return str(value) in parts


# ---------------------------------------------------------------------------
# Sprint 20 — AI & Predictions tasks
# ---------------------------------------------------------------------------


@shared_task(name="iot.train_ml_models")
def train_ml_models() -> dict[str, int]:
    """Train ML models (Isolation Forest + Linear Regression) for all active sensors.

    Runs daily via Celery beat. Trains incrementally using recent data.

    Returns:
        Dict with ``sensors_processed``, ``if_trained``, and ``lr_trained`` counts.
    """
    from .ml_engine import train_isolation_forest, train_linear_regression

    sensors = Sensor.objects.filter(is_active=True)
    if_trained = 0
    lr_trained = 0

    for sensor in sensors:
        try:
            if train_isolation_forest(sensor):
                if_trained += 1
        except Exception as exc:
            logger.error("IF training failed for sensor=%s: %s", sensor.pk, exc)

        try:
            if train_linear_regression(sensor):
                lr_trained += 1
        except Exception as exc:
            logger.error("LR training failed for sensor=%s: %s", sensor.pk, exc)

    logger.info(
        "ML training complete: sensors=%d IF=%d LR=%d",
        sensors.count(),
        if_trained,
        lr_trained,
    )
    return {
        "sensors_processed": sensors.count(),
        "if_trained": if_trained,
        "lr_trained": lr_trained,
    }


@shared_task(name="iot.generate_all_predictions")
def generate_all_predictions() -> dict[str, int]:
    """Generate 6-hour predictions for all sensors with trained LR models.

    Runs after model training or periodically.

    Returns:
        Dict with ``sensors_processed`` and ``predictions_created`` counts.
    """
    from .ml_engine import generate_predictions
    from .models import MLModel

    lr_models = MLModel.objects.filter(
        model_type=MLModel.ModelType.LINEAR_REGRESSION,
    ).select_related("sensor")

    predictions_created = 0
    for ml_model in lr_models:
        try:
            preds = generate_predictions(ml_model.sensor)
            predictions_created += len(preds)
        except Exception as exc:
            logger.error(
                "Prediction generation failed for sensor=%s: %s",
                ml_model.sensor_id,
                exc,
            )

    logger.info(
        "Prediction generation complete: models=%d predictions=%d",
        lr_models.count(),
        predictions_created,
    )
    return {
        "sensors_processed": lr_models.count(),
        "predictions_created": predictions_created,
    }


@shared_task(name="iot.detect_anomaly_ml_task")
def detect_anomaly_ml_task(reading_id: int) -> dict[str, bool]:
    """Detect anomalies using Isolation Forest for a new reading.

    Called after each SensorReading is persisted via signal.

    Args:
        reading_id: Primary key of the SensorReading to evaluate.

    Returns:
        Dict with ``anomaly`` boolean.
    """
    try:
        reading = (
            SensorReading.objects
            .select_related("sensor", "sensor__zone")
            .get(pk=reading_id)
        )
    except SensorReading.DoesNotExist:
        logger.warning("SensorReading %s not found — skipping ML anomaly detection", reading_id)
        return {"anomaly": False}

    from .ml_engine import detect_anomaly_ml

    result = detect_anomaly_ml(reading)
    return {"anomaly": result is not None}


@shared_task(name="iot.generate_smart_suggestions_task")
def generate_smart_suggestions_task() -> dict[str, int]:
    """Generate smart threshold suggestions for all active sensors.

    Runs weekly via Celery beat.

    Returns:
        Dict with ``sensors_processed`` and ``suggestions_created`` counts.
    """
    from .ml_engine import generate_smart_suggestions

    sensors = Sensor.objects.filter(is_active=True)
    suggestions_created = 0

    for sensor in sensors:
        try:
            suggestions = generate_smart_suggestions(sensor)
            suggestions_created += len(suggestions)
        except Exception as exc:
            logger.error("Suggestion generation failed for sensor=%s: %s", sensor.pk, exc)

    logger.info(
        "Smart suggestions complete: sensors=%d suggestions=%d",
        sensors.count(),
        suggestions_created,
    )
    return {
        "sensors_processed": sensors.count(),
        "suggestions_created": suggestions_created,
    }


@shared_task(name="iot.generate_weekly_ai_reports")
def generate_weekly_ai_reports() -> dict[str, int]:
    """Generate weekly AI reports for all active zones.

    Runs weekly via Celery beat (Monday 7am).

    Returns:
        Dict with ``zones_processed`` and ``reports_generated`` counts.
    """
    from .ml_engine import generate_weekly_ai_report

    zones = Zone.objects.filter(is_active=True)
    reports_generated = 0

    for zone in zones:
        try:
            report = generate_weekly_ai_report(zone.pk)
            if report:
                reports_generated += 1
                logger.info("Weekly AI report for zone=%s: %d chars", zone.pk, len(report))
        except Exception as exc:
            logger.error("Weekly AI report failed for zone=%s: %s", zone.pk, exc)

    logger.info(
        "Weekly AI reports complete: zones=%d reports=%d",
        zones.count(),
        reports_generated,
    )
    return {
        "zones_processed": zones.count(),
        "reports_generated": reports_generated,
    }


# ---------------------------------------------------------------------------
# Sprint 23 — Data Pipeline & Long-Term History tasks
# ---------------------------------------------------------------------------


@shared_task(name="iot.aggregate_daily_readings")
def aggregate_daily_readings_task() -> dict[str, int]:
    """Aggregate raw sensor readings into daily buckets.

    Runs daily via Celery beat to maintain the
    ``SensorReadingDaily`` aggregation table.

    Returns:
        Dict with ``sensors_processed`` and ``buckets_created`` counts.
    """
    from .data_pipeline import aggregate_daily_readings

    result = aggregate_daily_readings()
    logger.info(
        "Daily aggregation complete: sensors=%d buckets=%d",
        result["sensors_processed"],
        result["buckets_created"],
    )
    return result


@shared_task(name="iot.enforce_retention_policies")
def enforce_retention_policies_task() -> dict:
    """Enforce data retention policies for all organizations.

    Runs daily via Celery beat. Deletes expired raw readings,
    hourly aggregations, and daily aggregations based on per-org
    RetentionPolicy configuration.

    Returns:
        Dict with per-org deletion statistics.
    """
    from .data_pipeline import enforce_retention_policies

    result = enforce_retention_policies()
    logger.info(
        "Retention enforcement complete: orgs=%d",
        result["organizations_processed"],
    )
    return result


@shared_task(name="iot.archive_cold_storage")
def archive_cold_storage_task() -> dict[str, int]:
    """Archive expired data to S3/MinIO cold storage before deletion.

    Runs daily via Celery beat. Only processes organizations with
    cold storage archival enabled in their RetentionPolicy.

    Returns:
        Dict with ``organizations_processed`` and ``total_archived`` counts.
    """
    from .data_pipeline import archive_to_cold_storage
    from .models import RetentionPolicy

    policies = RetentionPolicy.objects.filter(
        archive_to_cold_storage=True,
    ).select_related("organization")

    orgs_processed = 0
    total_archived = 0

    for policy in policies:
        result = archive_to_cold_storage(policy)
        if result.get("archived"):
            total_archived += result.get("records", 0)
        orgs_processed += 1

    logger.info(
        "Cold storage archival complete: orgs=%d records=%d",
        orgs_processed,
        total_archived,
    )
    return {"organizations_processed": orgs_processed, "total_archived": total_archived}


@shared_task(name="iot.ensure_partitions")
def ensure_partitions_task() -> dict:
    """Ensure monthly PostgreSQL partitions exist for SensorReading.

    Runs daily via Celery beat to pre-create partitions for the
    current month and next 2 months.

    Returns:
        Dict with partition maintenance status.
    """
    from .data_pipeline import ensure_partitions

    result = ensure_partitions()
    logger.info("Partition maintenance: %s", result.get("status"))
    return result


@shared_task(name="iot.drop_old_partitions")
def drop_old_partitions_task() -> dict:
    """Drop empty partitions older than 6 months.

    Runs monthly via Celery beat to clean up unused partition tables.

    Returns:
        Dict with dropped partition info.
    """
    from .data_pipeline import drop_old_partitions

    result = drop_old_partitions(months_to_keep=6)
    logger.info("Partition cleanup: %s", result)
    return result


# ---------------------------------------------------------------------------
# Sprint 24 — Multi-Site Weather Tasks
# ---------------------------------------------------------------------------


@shared_task(name="iot.fetch_weather_for_all_sites")
def fetch_weather_for_all_sites() -> dict[str, int]:
    """Fetch weather data from Open-Meteo for all active sites.

    Runs every 30 minutes via Celery beat. Stores current conditions and
    hourly forecast data. Also analyzes forecasts for geo-contextual alerts.

    Returns:
        Dict with sites_processed, readings_stored, alerts_created counts.
    """
    from .models import Site, WeatherAlert, WeatherData
    from .weather_service import (
        analyze_forecast_for_alerts,
        fetch_weather,
        parse_current_weather,
        parse_hourly_forecast,
    )

    sites = Site.objects.filter(is_active=True)
    sites_processed = 0
    readings_stored = 0
    alerts_created = 0

    for site in sites:
        data = fetch_weather(
            latitude=site.latitude,
            longitude=site.longitude,
            timezone_str=site.timezone,
            forecast_days=3,
        )
        if not data:
            logger.warning("Failed to fetch weather for site %s", site.name)
            continue

        sites_processed += 1

        # Store current weather
        current = parse_current_weather(data)
        if current:
            ts_str = current.pop("timestamp", None)
            if ts_str:
                from django.utils.dateparse import parse_datetime
                ts = parse_datetime(ts_str) or timezone.now()
                WeatherData.objects.create(
                    site=site,
                    timestamp=ts,
                    **current,
                )
                readings_stored += 1

        # Store and analyze hourly forecast
        hourly = parse_hourly_forecast(data)

        # Delete old forecast data for this site before storing new
        WeatherData.objects.filter(site=site, is_forecast=True).delete()

        for entry in hourly:
            ts_str = entry.pop("timestamp", None)
            if ts_str:
                from django.utils.dateparse import parse_datetime
                ts = parse_datetime(ts_str)
                if ts:
                    WeatherData.objects.create(
                        site=site,
                        timestamp=ts,
                        **entry,
                    )
                    readings_stored += 1

        # Analyze forecast for geo-contextual alerts
        alert_defs = analyze_forecast_for_alerts(hourly, site.name)
        for alert_def in alert_defs:
            # Avoid duplicate alerts
            exists = WeatherAlert.objects.filter(
                site=site,
                title=alert_def["title"],
                forecast_date=alert_def["forecast_date"],
                is_acknowledged=False,
            ).exists()
            if not exists:
                WeatherAlert.objects.create(
                    site=site,
                    alert_level=alert_def["alert_level"],
                    title=alert_def["title"],
                    message=alert_def["message"],
                    forecast_date=alert_def["forecast_date"],
                )
                alerts_created += 1

    logger.info(
        "Weather fetch complete: %d sites, %d readings, %d alerts",
        sites_processed, readings_stored, alerts_created,
    )
    return {
        "sites_processed": sites_processed,
        "readings_stored": readings_stored,
        "alerts_created": alerts_created,
    }


@shared_task(name="iot.cleanup_old_weather_data")
def cleanup_old_weather_data(days: int = 30) -> dict[str, int]:
    """Delete weather data older than the specified number of days.

    Runs daily via Celery beat.

    Args:
        days: Number of days to keep weather history.

    Returns:
        Dict with deleted count.
    """
    from .models import WeatherData

    cutoff = timezone.now() - timedelta(days=days)
    deleted_count, _ = WeatherData.objects.filter(
        is_forecast=False,
        timestamp__lt=cutoff,
    ).delete()

    logger.info("Cleaned up %d old weather records", deleted_count)
    return {"deleted": deleted_count}


# ---------------------------------------------------------------------------
# Sprint 28 — Cloud CRM: sync batch ingestion
# ---------------------------------------------------------------------------


@shared_task(name="iot.ingest_sync_batch", queue="sync_ingest")
def ingest_sync_batch(batch_id: int, payload: dict) -> dict:
    """Ingest a sync batch received from an edge device on the cloud side.

    Reads ``payload`` (already decoded JSON from EdgeSyncView), inserts
    SensorReadings with deduplication, and marks the SyncBatch as SUCCESS or
    FAILED.

    Deduplication key: (sensor_id, received_at, value) to avoid inserting
    duplicates when the same batch is retried.

    Args:
        batch_id: PK of the SyncBatch record created by EdgeSyncView.
        payload:  Decoded JSON dict with keys: readings, commands, alerts,
                  audit_events.

    Returns:
        Summary dict with inserted counts.
    """
    from .models import AuditEvent, Command, SyncBatch

    try:
        batch = SyncBatch.objects.get(pk=batch_id)
    except SyncBatch.DoesNotExist:
        logger.error("ingest_sync_batch: SyncBatch %d not found", batch_id)
        return {"error": f"SyncBatch {batch_id} not found"}

    inserted_readings = 0
    duplicate_readings = 0

    try:
        # --- Readings ---
        for r in payload.get("readings", []):
            sensor_id = r.get("sensor_id")
            value = r.get("value")
            relay_ts = r.get("relay_timestamp")

            if sensor_id is None or value is None:
                continue

            # Deduplication key: (sensor_id, relay_timestamp, value).
            # received_at has auto_now_add so we cannot filter by it;
            # relay_timestamp is the edge-device timestamp and is stable.
            if relay_ts is not None:
                exists = SensorReading.objects.filter(
                    sensor_id=sensor_id,
                    relay_timestamp=relay_ts,
                    value=value,
                ).exists()
                if exists:
                    duplicate_readings += 1
                    continue

            SensorReading.objects.create(
                sensor_id=sensor_id,
                value=value,
                relay_timestamp=relay_ts,
                cloud_synced=True,
                cloud_synced_at=timezone.now(),
            )
            inserted_readings += 1

        batch.status = SyncBatch.Status.SUCCESS
        batch.completed_at = timezone.now()
        batch.save(update_fields=["status", "completed_at"])

        logger.info(
            "ingest_sync_batch %d: %d inserted, %d duplicates",
            batch_id, inserted_readings, duplicate_readings,
        )
        return {
            "batch_id": batch_id,
            "inserted_readings": inserted_readings,
            "duplicate_readings": duplicate_readings,
        }

    except Exception as exc:
        logger.exception("ingest_sync_batch %d failed: %s", batch_id, exc)
        batch.status = SyncBatch.Status.FAILED
        batch.error_message = str(exc)
        batch.save(update_fields=["status", "error_message"])
        return {"error": str(exc)}
