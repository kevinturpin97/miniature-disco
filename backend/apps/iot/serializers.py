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
    Sensor,
    SensorReading,
    Zone,
)


class GreenhouseSerializer(serializers.ModelSerializer):
    """Serializer for the Greenhouse model.

    The ``owner`` field is automatically set to the authenticated user on creation.

    Fields:
        id, owner (hidden), name, location, description, is_active,
        created_at, updated_at, zone_count.
    """

    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())
    zone_count = serializers.SerializerMethodField()

    class Meta:
        model = Greenhouse
        fields = (
            "id",
            "owner",
            "name",
            "location",
            "description",
            "is_active",
            "created_at",
            "updated_at",
            "zone_count",
        )
        read_only_fields = ("id", "created_at", "updated_at", "zone_count")

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
        created_at, sent_at, acknowledged_at, error_message.
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
            "created_at",
            "sent_at",
            "acknowledged_at",
            "error_message",
        )
        read_only_fields = (
            "id",
            "actuator",
            "status",
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
