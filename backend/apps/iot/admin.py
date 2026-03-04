"""Django admin configuration for IoT models."""

from django.contrib import admin

from .models import (
    Actuator,
    Alert,
    AuditEvent,
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
    SensorReadingHourly,
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


@admin.register(NotificationChannel)
class NotificationChannelAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "channel_type", "is_active", "created_at")
    list_filter = ("channel_type", "is_active", "organization")
    search_fields = ("name", "organization__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(NotificationRule)
class NotificationRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "channel", "is_active", "last_notified")
    list_filter = ("is_active", "organization")
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at", "last_notified")


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ("rule", "channel", "alert", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"


@admin.register(SensorReadingHourly)
class SensorReadingHourlyAdmin(admin.ModelAdmin):
    list_display = ("sensor", "hour", "avg_value", "min_value", "max_value", "count")
    list_filter = ("sensor__sensor_type",)
    readonly_fields = ("created_at",)
    date_hierarchy = "hour"


class ScenarioStepInline(admin.TabularInline):
    model = ScenarioStep
    extra = 0
    ordering = ("order",)


@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = ("name", "zone", "status", "is_active", "last_run_at", "created_at")
    list_filter = ("status", "is_active")
    search_fields = ("name", "zone__name")
    readonly_fields = ("created_at", "updated_at", "last_run_at")
    inlines = [ScenarioStepInline]


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ("name", "scenario", "schedule_type", "is_active", "next_run_at", "last_run_at")
    list_filter = ("schedule_type", "is_active")
    search_fields = ("name", "scenario__name")
    readonly_fields = ("created_at", "updated_at", "next_run_at", "last_run_at")


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "endpoint", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__username", "endpoint")
    readonly_fields = ("created_at",)


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("action", "user", "resource_type", "resource_id", "ip_address", "created_at")
    list_filter = ("action", "resource_type", "created_at")
    search_fields = ("description", "user__username", "resource_type")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"
