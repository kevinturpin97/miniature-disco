"""
Serializers for IoT models in the Greenhouse SaaS API.
"""

from datetime import datetime, timedelta, timezone

from rest_framework import serializers

from .models import (
    Actuator,
    Alert,
    AutomationRule,
    Command,
    Greenhouse,
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    PushSubscription,
    Scenario,
    ScenarioStep,
    Schedule,
    Sensor,
    SensorReading,
    Template,
    TemplateCategory,
    TemplateRating,
    Zone,
)


class GreenhouseSerializer(serializers.ModelSerializer):
    """Serializer for the Greenhouse model.

    The ``organization`` field is set from the view context.

    Fields:
        id, organization, name, location, description, is_active,
        created_at, updated_at, zone_count.
    """

    zone_count = serializers.SerializerMethodField()

    class Meta:
        model = Greenhouse
        fields = (
            "id",
            "organization",
            "name",
            "location",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "zone_count",
        )
        read_only_fields = ("id", "organization", "created_at", "updated_at", "zone_count")

    def get_zone_count(self, obj: Greenhouse) -> int:
        """Return the total number of zones in this greenhouse."""
        return obj.zones.count()


class ZoneSerializer(serializers.ModelSerializer):
    """Serializer for the Zone model.

    Fields:
        id, greenhouse, name, relay_id, description, is_active, last_seen,
        transmission_interval, created_at, updated_at, is_online.
    """

    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Zone
        fields = (
            "id",
            "greenhouse",
            "name",
            "relay_id",
            "description",
            "is_active",
            "last_seen",
            "transmission_interval",
            "created_at",
            "updated_at",
            "is_online",
        )
        read_only_fields = ("id", "greenhouse", "created_at", "updated_at", "is_online", "last_seen")

    def get_is_online(self, obj: Zone) -> bool:
        """Return True if the relay sent a heartbeat within 2x the transmission interval."""
        if not obj.last_seen:
            return False
        threshold = timedelta(seconds=obj.transmission_interval * 2)
        return datetime.now(timezone.utc) - obj.last_seen < threshold


class SensorSerializer(serializers.ModelSerializer):
    """Serializer for the Sensor model.

    Fields:
        id, zone, sensor_type, sensor_type_display, label, unit,
        min_threshold, max_threshold, is_active, created_at.
    """

    sensor_type_display = serializers.CharField(
        source="get_sensor_type_display", read_only=True
    )

    class Meta:
        model = Sensor
        fields = (
            "id",
            "zone",
            "sensor_type",
            "sensor_type_display",
            "label",
            "unit",
            "min_threshold",
            "max_threshold",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "zone", "created_at", "sensor_type_display")


class SensorReadingSerializer(serializers.ModelSerializer):
    """Serializer for SensorReading (read-only — created via MQTT ingestion).

    Fields:
        id, sensor, value, relay_timestamp, received_at.
    """

    class Meta:
        model = SensorReading
        fields = ("id", "sensor", "value", "relay_timestamp", "received_at")
        read_only_fields = ("id", "received_at")


class ActuatorSerializer(serializers.ModelSerializer):
    """Serializer for the Actuator model.

    Fields:
        id, zone, actuator_type, actuator_type_display, name, gpio_pin,
        state, is_active, created_at.
    """

    actuator_type_display = serializers.CharField(
        source="get_actuator_type_display", read_only=True
    )

    class Meta:
        model = Actuator
        fields = (
            "id",
            "zone",
            "actuator_type",
            "actuator_type_display",
            "name",
            "gpio_pin",
            "state",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "zone", "created_at", "actuator_type_display")


class CommandSerializer(serializers.ModelSerializer):
    """Serializer for the Command model.

    The ``created_by`` field is automatically set to the authenticated user.

    Fields:
        id, actuator, command_type, value, status, created_by (hidden),
        automation_rule, created_at, sent_at, acknowledged_at, error_message.
    """

    created_by = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Command
        fields = (
            "id",
            "actuator",
            "command_type",
            "value",
            "status",
            "created_by",
            "automation_rule",
            "created_at",
            "sent_at",
            "acknowledged_at",
            "error_message",
        )
        read_only_fields = (
            "id",
            "actuator",
            "status",
            "automation_rule",
            "created_at",
            "sent_at",
            "acknowledged_at",
            "error_message",
        )


class AutomationRuleSerializer(serializers.ModelSerializer):
    """Serializer for the AutomationRule model.

    Fields:
        id, zone, name, description, sensor_type, condition, threshold_value,
        action_actuator, action_command_type, action_value, cooldown_seconds,
        is_active, last_triggered, created_at.
    """

    class Meta:
        model = AutomationRule
        fields = (
            "id",
            "zone",
            "name",
            "description",
            "sensor_type",
            "condition",
            "threshold_value",
            "action_actuator",
            "action_command_type",
            "action_value",
            "cooldown_seconds",
            "is_active",
            "last_triggered",
            "created_at",
        )
        read_only_fields = ("id", "zone", "last_triggered", "created_at")


class AlertSerializer(serializers.ModelSerializer):
    """Serializer for the Alert model.

    Fields:
        id, sensor, zone, alert_type, severity, value, message,
        is_acknowledged, acknowledged_by, acknowledged_at, created_at.
    """

    class Meta:
        model = Alert
        fields = (
            "id",
            "sensor",
            "zone",
            "alert_type",
            "severity",
            "value",
            "message",
            "is_acknowledged",
            "acknowledged_by",
            "acknowledged_at",
            "created_at",
        )
        read_only_fields = (
            "id",
            "is_acknowledged",
            "acknowledged_by",
            "acknowledged_at",
            "created_at",
        )


class NotificationChannelSerializer(serializers.ModelSerializer):
    """Serializer for the NotificationChannel model.

    Fields:
        id, organization, channel_type, name, is_active,
        email_recipients, webhook_url, webhook_secret,
        telegram_bot_token, telegram_chat_id,
        created_at, updated_at.
    """

    class Meta:
        model = NotificationChannel
        fields = (
            "id",
            "organization",
            "channel_type",
            "name",
            "is_active",
            "email_recipients",
            "webhook_url",
            "webhook_secret",
            "telegram_bot_token",
            "telegram_chat_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "organization", "created_at", "updated_at")
        extra_kwargs = {
            "webhook_secret": {"write_only": True},
            "telegram_bot_token": {"write_only": True},
        }

    def validate(self, attrs: dict) -> dict:
        """Validate channel-type-specific required fields."""
        channel_type = attrs.get("channel_type", getattr(self.instance, "channel_type", None))

        if channel_type == NotificationChannel.ChannelType.EMAIL:
            recipients = attrs.get("email_recipients", getattr(self.instance, "email_recipients", ""))
            if not recipients or not recipients.strip():
                raise serializers.ValidationError(
                    {"email_recipients": "Email recipients are required for EMAIL channels."}
                )

        elif channel_type == NotificationChannel.ChannelType.WEBHOOK:
            url = attrs.get("webhook_url", getattr(self.instance, "webhook_url", ""))
            if not url or not url.strip():
                raise serializers.ValidationError(
                    {"webhook_url": "Webhook URL is required for WEBHOOK channels."}
                )

        elif channel_type == NotificationChannel.ChannelType.TELEGRAM:
            token = attrs.get("telegram_bot_token", getattr(self.instance, "telegram_bot_token", ""))
            chat_id = attrs.get("telegram_chat_id", getattr(self.instance, "telegram_chat_id", ""))
            if not token or not token.strip():
                raise serializers.ValidationError(
                    {"telegram_bot_token": "Bot token is required for TELEGRAM channels."}
                )
            if not chat_id or not chat_id.strip():
                raise serializers.ValidationError(
                    {"telegram_chat_id": "Chat ID is required for TELEGRAM channels."}
                )

        return attrs

    def to_representation(self, instance: NotificationChannel) -> dict:
        """Mask sensitive fields in responses."""
        data = super().to_representation(instance)
        # Show whether secrets are configured without revealing values
        data["has_webhook_secret"] = bool(instance.webhook_secret)
        data["has_telegram_bot_token"] = bool(instance.telegram_bot_token)
        return data


class NotificationRuleSerializer(serializers.ModelSerializer):
    """Serializer for the NotificationRule model.

    Fields:
        id, organization, name, channel, channel_name,
        alert_types, severities, is_active, cooldown_seconds,
        last_notified, created_at, updated_at.
    """

    channel_name = serializers.CharField(source="channel.name", read_only=True)

    class Meta:
        model = NotificationRule
        fields = (
            "id",
            "organization",
            "name",
            "channel",
            "channel_name",
            "alert_types",
            "severities",
            "is_active",
            "cooldown_seconds",
            "last_notified",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "organization", "last_notified", "created_at", "updated_at")

    def validate_alert_types(self, value: list) -> list:
        """Ensure all alert types are valid choices."""
        valid = {c[0] for c in Alert.AlertType.choices}
        for t in value:
            if t not in valid:
                raise serializers.ValidationError(f"Invalid alert type: {t}")
        return value

    def validate_severities(self, value: list) -> list:
        """Ensure all severities are valid choices."""
        valid = {c[0] for c in Alert.Severity.choices}
        for s in value:
            if s not in valid:
                raise serializers.ValidationError(f"Invalid severity: {s}")
        return value

    def validate_channel(self, value: NotificationChannel) -> NotificationChannel:
        """Ensure the channel belongs to the same organization."""
        request = self.context.get("request")
        if request and hasattr(request, "_org"):
            if value.organization_id != request._org.pk:
                raise serializers.ValidationError("Channel must belong to the same organization.")
        return value


class NotificationLogSerializer(serializers.ModelSerializer):
    """Serializer for the NotificationLog model (read-only).

    Fields:
        id, rule, channel, alert, status, error_message, created_at.
    """

    rule_name = serializers.CharField(source="rule.name", read_only=True, default="")
    channel_name = serializers.CharField(source="channel.name", read_only=True, default="")

    class Meta:
        model = NotificationLog
        fields = (
            "id",
            "rule",
            "rule_name",
            "channel",
            "channel_name",
            "alert",
            "status",
            "error_message",
            "created_at",
        )
        read_only_fields = fields


class PushSubscriptionSerializer(serializers.ModelSerializer):
    """Serializer for the PushSubscription model.

    Fields:
        id, endpoint, p256dh, auth, created_at.
    """

    class Meta:
        model = PushSubscription
        fields = ("id", "endpoint", "p256dh", "auth", "created_at")
        read_only_fields = ("id", "created_at")
        extra_kwargs = {
            "endpoint": {"validators": []},
        }


class ScenarioStepSerializer(serializers.ModelSerializer):
    """Serializer for ScenarioStep — nested within ScenarioSerializer.

    Fields:
        id, actuator, actuator_name, order, action, action_value,
        delay_seconds, duration_seconds.
    """

    actuator_name = serializers.CharField(source="actuator.name", read_only=True)

    class Meta:
        model = ScenarioStep
        fields = (
            "id",
            "actuator",
            "actuator_name",
            "order",
            "action",
            "action_value",
            "delay_seconds",
            "duration_seconds",
        )
        read_only_fields = ("id",)


class ScenarioSerializer(serializers.ModelSerializer):
    """Serializer for the Scenario model.

    Includes nested steps (read) and accepts step writes through
    the ``steps`` field.

    Fields:
        id, zone, name, description, status, is_active, last_run_at,
        steps, created_at, updated_at.
    """

    steps = ScenarioStepSerializer(many=True, required=False)

    class Meta:
        model = Scenario
        fields = (
            "id",
            "zone",
            "name",
            "description",
            "status",
            "is_active",
            "last_run_at",
            "steps",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "zone", "status", "last_run_at", "created_at", "updated_at")

    def create(self, validated_data: dict) -> Scenario:
        """Create a scenario with nested steps."""
        steps_data = validated_data.pop("steps", [])
        scenario = Scenario.objects.create(**validated_data)
        for step_data in steps_data:
            ScenarioStep.objects.create(scenario=scenario, **step_data)
        return scenario

    def update(self, instance: Scenario, validated_data: dict) -> Scenario:
        """Update a scenario and replace its steps if provided."""
        steps_data = validated_data.pop("steps", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if steps_data is not None:
            instance.steps.all().delete()
            for step_data in steps_data:
                ScenarioStep.objects.create(scenario=instance, **step_data)

        return instance

    def validate_steps(self, value: list) -> list:
        """Validate that step orders are unique and sequential."""
        if not value:
            return value
        orders = [s.get("order", s.get("order")) for s in value]
        if len(orders) != len(set(orders)):
            raise serializers.ValidationError("Step orders must be unique.")
        return value


class ScheduleSerializer(serializers.ModelSerializer):
    """Serializer for the Schedule model.

    Fields:
        id, scenario, scenario_name, name, schedule_type,
        cron_minute, cron_hour, cron_day_of_week,
        start_time, end_time, days_of_week,
        is_active, next_run_at, last_run_at, created_at, updated_at.
    """

    scenario_name = serializers.CharField(source="scenario.name", read_only=True)

    class Meta:
        model = Schedule
        fields = (
            "id",
            "scenario",
            "scenario_name",
            "name",
            "schedule_type",
            "cron_minute",
            "cron_hour",
            "cron_day_of_week",
            "start_time",
            "end_time",
            "days_of_week",
            "is_active",
            "next_run_at",
            "last_run_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "next_run_at", "last_run_at", "created_at", "updated_at")

    def validate(self, attrs: dict) -> dict:
        """Validate schedule-type-specific fields."""
        schedule_type = attrs.get("schedule_type", getattr(self.instance, "schedule_type", None))

        if schedule_type == Schedule.ScheduleType.TIME_RANGE:
            start = attrs.get("start_time", getattr(self.instance, "start_time", None))
            end = attrs.get("end_time", getattr(self.instance, "end_time", None))
            if not start:
                raise serializers.ValidationError(
                    {"start_time": "Start time is required for TIME_RANGE schedules."}
                )
            if not end:
                raise serializers.ValidationError(
                    {"end_time": "End time is required for TIME_RANGE schedules."}
                )

        return attrs


class TemplateCategorySerializer(serializers.ModelSerializer):
    """Serializer for the TemplateCategory model.

    Fields:
        id, name, slug, description, icon, order, template_count.
    """

    template_count = serializers.SerializerMethodField()

    class Meta:
        model = TemplateCategory
        fields = ("id", "name", "slug", "description", "icon", "order", "template_count")
        read_only_fields = ("id",)

    def get_template_count(self, obj: TemplateCategory) -> int:
        """Return the number of published templates in this category."""
        return obj.templates.filter(is_published=True).count()


class TemplateRatingSerializer(serializers.ModelSerializer):
    """Serializer for the TemplateRating model.

    Fields:
        id, template, user, username, score, comment, created_at, updated_at.
    """

    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = TemplateRating
        fields = ("id", "template", "user", "username", "score", "comment", "created_at", "updated_at")
        read_only_fields = ("id", "template", "user", "created_at", "updated_at")


class TemplateSerializer(serializers.ModelSerializer):
    """Serializer for the Template model.

    Fields:
        id, organization, organization_name, category, category_name,
        name, description, is_official, is_published, version, changelog,
        config, avg_rating, rating_count, clone_count, created_by,
        created_by_username, created_at, updated_at, user_rating.
    """

    organization_name = serializers.CharField(
        source="organization.name", read_only=True, default=""
    )
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=""
    )
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=""
    )
    user_rating = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = (
            "id",
            "organization",
            "organization_name",
            "category",
            "category_name",
            "name",
            "description",
            "is_official",
            "is_published",
            "version",
            "changelog",
            "config",
            "avg_rating",
            "rating_count",
            "clone_count",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
            "user_rating",
        )
        read_only_fields = (
            "id",
            "organization",
            "avg_rating",
            "rating_count",
            "clone_count",
            "created_by",
            "created_at",
            "updated_at",
            "user_rating",
        )

    def get_user_rating(self, obj: Template) -> int | None:
        """Return the authenticated user's rating for this template, or null."""
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        rating = obj.ratings.filter(user=request.user).first()
        return rating.score if rating else None

    def validate_config(self, value: dict) -> dict:
        """Validate the template config structure."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Config must be a JSON object.")
        allowed_keys = {"sensors", "actuators", "automation_rules", "scenarios"}
        for key in value:
            if key not in allowed_keys:
                raise serializers.ValidationError(
                    f"Config key '{key}' is not allowed. Use: {', '.join(sorted(allowed_keys))}."
                )
        return value


class TemplatePublishSerializer(serializers.Serializer):
    """Serializer for publishing a zone configuration as a template.

    Fields:
        name, description, category, version, changelog, is_published.
    """

    name = serializers.CharField(max_length=150)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    category = serializers.PrimaryKeyRelatedField(
        queryset=TemplateCategory.objects.all(),
        required=False,
        allow_null=True,
    )
    version = serializers.CharField(max_length=20, default="1.0.0")
    changelog = serializers.CharField(required=False, allow_blank=True, default="")
    is_published = serializers.BooleanField(default=True)


class TemplateImportSerializer(serializers.Serializer):
    """Serializer for importing a template into a zone.

    Fields:
        mode — 'merge' keeps existing resources, 'replace' wipes and recreates.
    """

    mode = serializers.ChoiceField(choices=["merge", "replace"], default="merge")


# ---------------------------------------------------------------------------
# Sprint 20 — AI & Predictions serializers
# ---------------------------------------------------------------------------


class SensorPredictionSerializer(serializers.ModelSerializer):
    """Serializer for SensorPrediction (read-only).

    Fields:
        id, sensor, predicted_at, predicted_value, confidence_lower,
        confidence_upper, generated_at.
    """

    class Meta:
        from .models import SensorPrediction

        model = SensorPrediction
        fields = (
            "id",
            "sensor",
            "predicted_at",
            "predicted_value",
            "confidence_lower",
            "confidence_upper",
            "generated_at",
        )
        read_only_fields = fields


class AnomalyRecordSerializer(serializers.ModelSerializer):
    """Serializer for AnomalyRecord (read-only).

    Fields:
        id, sensor, reading, detection_method, anomaly_score,
        value, explanation, detected_at.
    """

    sensor_type = serializers.CharField(source="sensor.sensor_type", read_only=True)
    zone_name = serializers.CharField(source="sensor.zone.name", read_only=True)

    class Meta:
        from .models import AnomalyRecord

        model = AnomalyRecord
        fields = (
            "id",
            "sensor",
            "sensor_type",
            "zone_name",
            "reading",
            "detection_method",
            "anomaly_score",
            "value",
            "explanation",
            "detected_at",
        )
        read_only_fields = fields


class SmartSuggestionSerializer(serializers.ModelSerializer):
    """Serializer for SmartSuggestion (read-only).

    Fields:
        id, sensor, sensor_type, suggestion_type, message,
        suggested_min, suggested_max, confidence, is_applied, created_at.
    """

    sensor_type = serializers.CharField(source="sensor.sensor_type", read_only=True)

    class Meta:
        from .models import SmartSuggestion

        model = SmartSuggestion
        fields = (
            "id",
            "sensor",
            "sensor_type",
            "suggestion_type",
            "message",
            "suggested_min",
            "suggested_max",
            "confidence",
            "is_applied",
            "created_at",
        )
        read_only_fields = fields


class ApplySuggestionSerializer(serializers.Serializer):
    """Serializer for applying a smart suggestion to a sensor."""

    suggestion_id = serializers.IntegerField()


class RetentionPolicySerializer(serializers.ModelSerializer):
    """Serializer for the per-organization data retention policy.

    Fields:
        raw_retention_days, hourly_retention_days, daily_retention_days,
        archive_to_cold_storage, cold_storage_bucket, cold_storage_prefix,
        last_cleanup_at, last_archive_at, created_at, updated_at.
    """

    class Meta:
        from .models import RetentionPolicy

        model = RetentionPolicy
        fields = (
            "raw_retention_days",
            "hourly_retention_days",
            "daily_retention_days",
            "archive_to_cold_storage",
            "cold_storage_bucket",
            "cold_storage_prefix",
            "last_cleanup_at",
            "last_archive_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("last_cleanup_at", "last_archive_at", "created_at", "updated_at")


class DataArchiveLogSerializer(serializers.ModelSerializer):
    """Serializer for data archival audit log entries.

    Fields:
        id, archive_type, status, records_archived, records_deleted,
        date_range_start, date_range_end, storage_path, error_message,
        started_at, completed_at.
    """

    class Meta:
        from .models import DataArchiveLog

        model = DataArchiveLog
        fields = (
            "id",
            "archive_type",
            "status",
            "records_archived",
            "records_deleted",
            "date_range_start",
            "date_range_end",
            "storage_path",
            "error_message",
            "started_at",
            "completed_at",
        )
        read_only_fields = fields
