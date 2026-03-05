"""Django admin configuration for IoT models."""

from django.contrib import admin

from .models import (
    Actuator,
    Alert,
    AnomalyRecord,
    AuditEvent,
    AutomationRule,
    Command,
    CropCycle,
    CultureLog,
    Greenhouse,
    MLModel,
    Note,
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    PushSubscription,
    Scenario,
    ScenarioStep,
    Schedule,
    Sensor,
    SensorPrediction,
    SensorReading,
    SensorReadingHourly,
    Site,
    SmartSuggestion,
    Template,
    TemplateCategory,
    TemplateRating,
    TraceabilityReport,
    WeatherAlert,
    WeatherData,
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


@admin.register(TemplateCategory)
class TemplateCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "order")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("order", "name")


class TemplateRatingInline(admin.TabularInline):
    model = TemplateRating
    extra = 0
    readonly_fields = ("user", "score", "comment", "created_at")


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "organization", "version", "is_official", "is_published", "avg_rating", "clone_count", "created_at")
    list_filter = ("is_official", "is_published", "category", "created_at")
    search_fields = ("name", "description", "organization__name")
    readonly_fields = ("avg_rating", "rating_count", "clone_count", "created_at", "updated_at")
    inlines = [TemplateRatingInline]


@admin.register(TemplateRating)
class TemplateRatingAdmin(admin.ModelAdmin):
    list_display = ("template", "user", "score", "created_at")
    list_filter = ("score", "created_at")
    search_fields = ("template__name", "user__username")
    readonly_fields = ("created_at", "updated_at")


# Sprint 20 — AI & Predictions models


@admin.register(MLModel)
class MLModelAdmin(admin.ModelAdmin):
    list_display = ("sensor", "model_type", "training_samples", "mean_absolute_error", "last_trained_at")
    list_filter = ("model_type",)
    search_fields = ("sensor__zone__name",)
    readonly_fields = ("created_at", "last_trained_at")


@admin.register(SensorPrediction)
class SensorPredictionAdmin(admin.ModelAdmin):
    list_display = ("sensor", "predicted_at", "predicted_value", "confidence_lower", "confidence_upper", "generated_at")
    list_filter = ("sensor__sensor_type",)
    readonly_fields = ("generated_at",)
    date_hierarchy = "predicted_at"


@admin.register(AnomalyRecord)
class AnomalyRecordAdmin(admin.ModelAdmin):
    list_display = ("sensor", "detection_method", "anomaly_score", "value", "detected_at")
    list_filter = ("detection_method", "detected_at")
    search_fields = ("sensor__zone__name", "explanation")
    readonly_fields = ("detected_at",)
    date_hierarchy = "detected_at"


@admin.register(SmartSuggestion)
class SmartSuggestionAdmin(admin.ModelAdmin):
    list_display = ("sensor", "suggestion_type", "suggested_min", "suggested_max", "confidence", "is_applied", "created_at")
    list_filter = ("suggestion_type", "is_applied")
    search_fields = ("sensor__zone__name", "message")
    readonly_fields = ("created_at",)


# Sprint 24 — Multi-Site & Cartography


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "latitude", "longitude", "timezone", "is_active", "created_at")
    list_filter = ("is_active", "organization")
    search_fields = ("name", "address", "organization__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(WeatherData)
class WeatherDataAdmin(admin.ModelAdmin):
    list_display = ("site", "timestamp", "temperature", "humidity", "precipitation", "uv_index", "is_forecast")
    list_filter = ("is_forecast", "site")
    readonly_fields = ("fetched_at",)
    date_hierarchy = "timestamp"


@admin.register(WeatherAlert)
class WeatherAlertAdmin(admin.ModelAdmin):
    list_display = ("title", "site", "alert_level", "forecast_date", "is_acknowledged", "created_at")
    list_filter = ("alert_level", "is_acknowledged", "site")
    search_fields = ("title", "message", "site__name")
    readonly_fields = ("created_at",)


# Sprint 25 — Compliance & Agricultural Traceability


@admin.register(CropCycle)
class CropCycleAdmin(admin.ModelAdmin):
    list_display = ("species", "variety", "zone", "status", "sowing_date", "harvest_start_date", "created_at")
    list_filter = ("status", "zone__greenhouse")
    search_fields = ("species", "variety", "zone__name")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("zone", "author", "content_preview", "observed_at", "created_at")
    list_filter = ("zone__greenhouse",)
    search_fields = ("content", "zone__name", "author__username")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "observed_at"

    @admin.display(description="Content")
    def content_preview(self, obj) -> str:
        return obj.content[:80] if obj.content else ""


@admin.register(CultureLog)
class CultureLogAdmin(admin.ModelAdmin):
    list_display = ("entry_type", "zone", "summary_preview", "user", "created_at")
    list_filter = ("entry_type", "zone__greenhouse")
    search_fields = ("summary", "zone__name")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"

    @admin.display(description="Summary")
    def summary_preview(self, obj) -> str:
        return obj.summary[:80] if obj.summary else ""


@admin.register(TraceabilityReport)
class TraceabilityReportAdmin(admin.ModelAdmin):
    list_display = ("zone", "period_start", "period_end", "sha256_hash", "signed_at", "generated_by", "created_at")
    list_filter = ("zone__greenhouse",)
    search_fields = ("zone__name", "sha256_hash")
    readonly_fields = ("created_at", "sha256_hash", "signed_at")
