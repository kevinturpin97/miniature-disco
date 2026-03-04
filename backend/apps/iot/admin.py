"""Django admin configuration for IoT models."""

from django.contrib import admin

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


@admin.register(Greenhouse)
class GreenhouseAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "owner", "location", "is_active", "created_at")
    list_filter = ("is_active", "organization", "created_at")
    search_fields = ("name", "location", "organization__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("name", "greenhouse", "relay_id", "is_active", "last_seen")
    list_filter = ("is_active", "greenhouse")
    search_fields = ("name", "greenhouse__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Sensor)
class SensorAdmin(admin.ModelAdmin):
    list_display = ("zone", "sensor_type", "label", "unit", "is_active")
    list_filter = ("sensor_type", "is_active")
    search_fields = ("label", "zone__name")
    readonly_fields = ("created_at",)


@admin.register(SensorReading)
class SensorReadingAdmin(admin.ModelAdmin):
    list_display = ("sensor", "value", "received_at")
    list_filter = ("sensor__sensor_type", "received_at")
    readonly_fields = ("received_at",)
    date_hierarchy = "received_at"


@admin.register(Actuator)
class ActuatorAdmin(admin.ModelAdmin):
    list_display = ("name", "zone", "actuator_type", "state", "is_active")
    list_filter = ("actuator_type", "state", "is_active")
    search_fields = ("name", "zone__name")
    readonly_fields = ("created_at",)


@admin.register(Command)
class CommandAdmin(admin.ModelAdmin):
    list_display = ("actuator", "command_type", "status", "created_by", "created_at")
    list_filter = ("command_type", "status")
    search_fields = ("actuator__name",)
    readonly_fields = ("created_at",)


@admin.register(AutomationRule)
class AutomationRuleAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "zone",
        "sensor_type",
        "condition",
        "threshold_value",
        "action_actuator",
        "is_active",
    )
    list_filter = ("sensor_type", "condition", "is_active")
    search_fields = ("name", "zone__name")
    readonly_fields = ("created_at", "last_triggered")


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = (
        "alert_type",
        "severity",
        "zone",
        "message",
        "is_acknowledged",
        "created_at",
    )
    list_filter = ("alert_type", "severity", "is_acknowledged")
    search_fields = ("message", "zone__name")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"
