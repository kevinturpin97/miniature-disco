"""URL configuration for the IoT app."""

from django.urls import path

from .views import (
    ActuatorViewSet,
    AlertViewSet,
    AutomationRuleViewSet,
    CommandViewSet,
    EdgeDeviceViewSet,
    GreenhouseViewSet,
    NotificationChannelViewSet,
    NotificationLogViewSet,
    NotificationRuleViewSet,
    OrgAnalyticsSummaryView,
    PushSubscriptionView,
    ScenarioViewSet,
    ScheduleViewSet,
    SensorViewSet,
    SyncStatusView,
    TemplateCategoryViewSet,
    TemplateViewSet,
    VapidPublicKeyView,
    ZoneAIReportView,
    ZoneAnalyticsView,
    ZoneAnomaliesView,
    ZoneCropIndicatorPreferenceView,
    ZoneCropStatusView,
    ZonePredictionsView,
    ZonePublishTemplateView,
    ZoneReportPDFView,
    ZoneSuggestionsView,
    ZoneViewSet,
)

greenhouse_list = GreenhouseViewSet.as_view({"get": "list", "post": "create"})
greenhouse_detail = GreenhouseViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)

zone_list = ZoneViewSet.as_view({"get": "list", "post": "create"})
zone_detail = ZoneViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
zone_export_csv = ZoneViewSet.as_view({"get": "export_csv"})

sensor_list = SensorViewSet.as_view({"get": "list", "post": "create"})
sensor_detail = SensorViewSet.as_view({"patch": "partial_update", "delete": "destroy"})
sensor_readings = SensorViewSet.as_view({"get": "readings"})

actuator_list = ActuatorViewSet.as_view({"get": "list", "post": "create"})
actuator_detail = ActuatorViewSet.as_view({"patch": "partial_update", "delete": "destroy"})

command_create = CommandViewSet.as_view({"post": "create"})
command_list_by_zone = CommandViewSet.as_view({"get": "list"})

automation_list = AutomationRuleViewSet.as_view({"get": "list", "post": "create"})
automation_detail = AutomationRuleViewSet.as_view(
    {"patch": "partial_update", "delete": "destroy"}
)

alert_list = AlertViewSet.as_view({"get": "list"})
alert_acknowledge = AlertViewSet.as_view({"patch": "acknowledge"})

# Notification channels
notif_channel_list = NotificationChannelViewSet.as_view({"get": "list", "post": "create"})
notif_channel_detail = NotificationChannelViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)

# Notification rules
notif_rule_list = NotificationRuleViewSet.as_view({"get": "list", "post": "create"})
notif_rule_detail = NotificationRuleViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)

# Notification logs
notif_log_list = NotificationLogViewSet.as_view({"get": "list"})

# Analytics
zone_analytics = ZoneAnalyticsView.as_view({"get": "retrieve"})
zone_report_pdf = ZoneReportPDFView.as_view({"get": "retrieve"})
org_analytics_summary = OrgAnalyticsSummaryView.as_view({"get": "list"})

# Scenarios
scenario_list = ScenarioViewSet.as_view({"get": "list", "post": "create"})
scenario_detail = ScenarioViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
scenario_run = ScenarioViewSet.as_view({"post": "run_now"})

# Schedules
schedule_list = ScheduleViewSet.as_view({"get": "list", "post": "create"})
schedule_detail = ScheduleViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)

# Push subscriptions
push_subscribe = PushSubscriptionView.as_view({"post": "create", "delete": "destroy"})
vapid_public_key = VapidPublicKeyView.as_view({"get": "list"})

# Templates (marketplace)
template_list = TemplateViewSet.as_view({"get": "list", "post": "create"})
template_detail = TemplateViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
template_clone = TemplateViewSet.as_view({"post": "clone"})
template_rate = TemplateViewSet.as_view({"post": "rate"})
template_ratings = TemplateViewSet.as_view({"get": "ratings"})
template_category_list = TemplateCategoryViewSet.as_view({"get": "list"})
zone_publish_template = ZonePublishTemplateView.as_view({"post": "create"})

# AI & Predictions (Sprint 20)
zone_predictions = ZonePredictionsView.as_view({"get": "retrieve"})
zone_anomalies = ZoneAnomaliesView.as_view({"get": "retrieve"})
zone_suggestions = ZoneSuggestionsView.as_view({"get": "list"})
zone_suggestions_apply = ZoneSuggestionsView.as_view({"post": "apply"})
zone_ai_report = ZoneAIReportView.as_view({"get": "retrieve"})

# Sprint 31 — Crop Intelligence
zone_crop_status = ZoneCropStatusView.as_view({"get": "retrieve"})
zone_crop_indicator_preferences = ZoneCropIndicatorPreferenceView.as_view(
    {"get": "list", "patch": "partial_update"}
)

# Data Pipeline (Sprint 23)
from .views import DataPipelineView, RetentionPolicyView
from .streaming import stream_zone_readings

retention_policy_detail = RetentionPolicyView.as_view({
    "get": "retrieve", "put": "update", "patch": "partial_update",
})
data_pipeline_status = DataPipelineView.as_view({"get": "list"})

# Sprint 24 — Multi-Site & Cartography
from .views import SiteDashboardView, SiteViewSet, WeatherAlertViewSet, WeatherCorrelationView

site_list = SiteViewSet.as_view({"get": "list", "post": "create"})
site_detail = SiteViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
site_weather = SiteViewSet.as_view({"get": "weather"})
site_weather_history = SiteViewSet.as_view({"get": "weather_history"})
site_dashboard = SiteDashboardView.as_view({"get": "list"})
weather_alert_list = WeatherAlertViewSet.as_view({"get": "list"})
weather_alert_acknowledge = WeatherAlertViewSet.as_view({"patch": "acknowledge"})
weather_correlation = WeatherCorrelationView.as_view({"get": "retrieve"})

# Sprint 25 — Compliance & Agricultural Traceability
from .views import (
    CropCycleViewSet,
    CultureLogViewSet,
    GDPRExportView,
    GDPRErasureView,
    GlobalGAPExportView,
    NoteViewSet,
    TraceabilityReportView,
)

crop_cycle_list = CropCycleViewSet.as_view({"get": "list", "post": "create"})
crop_cycle_detail = CropCycleViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
note_list = NoteViewSet.as_view({"get": "list", "post": "create"})
note_detail = NoteViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
culture_journal = CultureLogViewSet.as_view({"get": "list"})
traceability_pdf = TraceabilityReportView.as_view({"post": "create"})
traceability_verify = TraceabilityReportView.as_view({"get": "verify"})
gdpr_export = GDPRExportView.as_view({"get": "list"})
gdpr_erasure = GDPRErasureView.as_view({"post": "create"})
globalgap_export = GlobalGAPExportView.as_view({"get": "retrieve"})

urlpatterns = [
    # Greenhouses
    path("greenhouses/", greenhouse_list, name="greenhouse-list"),
    path("greenhouses/<int:pk>/", greenhouse_detail, name="greenhouse-detail"),
    # Zones — nested under greenhouse + standalone
    path("greenhouses/<int:greenhouse_id>/zones/", zone_list, name="zone-list"),
    path("zones/<int:pk>/", zone_detail, name="zone-detail"),
    path("zones/<int:pk>/export/csv/", zone_export_csv, name="zone-export-csv"),
    # Sensors — nested under zone + standalone patch
    path("zones/<int:zone_id>/sensors/", sensor_list, name="sensor-list"),
    path("sensors/<int:pk>/", sensor_detail, name="sensor-detail"),
    path("sensors/<int:pk>/readings/", sensor_readings, name="sensor-readings"),
    # Actuators — nested under zone + standalone patch
    path("zones/<int:zone_id>/actuators/", actuator_list, name="actuator-list"),
    path("actuators/<int:pk>/", actuator_detail, name="actuator-detail"),
    # Commands — create under actuator, list under zone
    path("actuators/<int:actuator_id>/commands/", command_create, name="command-create"),
    path("zones/<int:zone_id>/commands/", command_list_by_zone, name="command-list"),
    # Automation rules — nested under zone + standalone patch/delete
    path("zones/<int:zone_id>/automations/", automation_list, name="automation-list"),
    path("automations/<int:pk>/", automation_detail, name="automation-detail"),
    # Alerts
    path("alerts/", alert_list, name="alert-list"),
    path("alerts/<int:pk>/acknowledge/", alert_acknowledge, name="alert-acknowledge"),
    # Notification channels — nested under org
    path("orgs/<slug:slug>/notifications/channels/", notif_channel_list, name="notif-channel-list"),
    path("orgs/<slug:slug>/notifications/channels/<int:pk>/", notif_channel_detail, name="notif-channel-detail"),
    # Notification rules — nested under org
    path("orgs/<slug:slug>/notifications/rules/", notif_rule_list, name="notif-rule-list"),
    path("orgs/<slug:slug>/notifications/rules/<int:pk>/", notif_rule_detail, name="notif-rule-detail"),
    # Notification logs — nested under org
    path("orgs/<slug:slug>/notifications/logs/", notif_log_list, name="notif-log-list"),
    # Analytics — zone-level
    path("zones/<int:pk>/analytics/", zone_analytics, name="zone-analytics"),
    path("zones/<int:pk>/report/pdf/", zone_report_pdf, name="zone-report-pdf"),
    # Analytics — org-level
    path("orgs/<slug:slug>/analytics/summary/", org_analytics_summary, name="org-analytics-summary"),
    # Scenarios — nested under zone + standalone
    path("zones/<int:zone_id>/scenarios/", scenario_list, name="scenario-list"),
    path("scenarios/<int:pk>/", scenario_detail, name="scenario-detail"),
    path("scenarios/<int:pk>/run/", scenario_run, name="scenario-run"),
    # Schedules — nested under zone + standalone
    path("zones/<int:zone_id>/schedules/", schedule_list, name="schedule-list"),
    path("schedules/<int:pk>/", schedule_detail, name="schedule-detail"),
    # Push notifications
    path("push/subscribe/", push_subscribe, name="push-subscribe"),
    path("push/vapid-key/", vapid_public_key, name="vapid-public-key"),
    # Templates (marketplace)
    path("templates/", template_list, name="template-list"),
    path("templates/categories/", template_category_list, name="template-category-list"),
    path("templates/<int:pk>/", template_detail, name="template-detail"),
    path("templates/<int:pk>/clone/", template_clone, name="template-clone"),
    path("templates/<int:pk>/rate/", template_rate, name="template-rate"),
    path("templates/<int:pk>/ratings/", template_ratings, name="template-ratings"),
    path("zones/<int:pk>/publish-template/", zone_publish_template, name="zone-publish-template"),
    # AI & Predictions (Sprint 20)
    path("zones/<int:pk>/predictions/", zone_predictions, name="zone-predictions"),
    path("zones/<int:pk>/anomalies/", zone_anomalies, name="zone-anomalies"),
    path("zones/<int:pk>/suggestions/", zone_suggestions, name="zone-suggestions"),
    path("zones/<int:pk>/suggestions/apply/", zone_suggestions_apply, name="zone-suggestions-apply"),
    path("zones/<int:pk>/ai-report/", zone_ai_report, name="zone-ai-report"),
    # Data Pipeline & Streaming (Sprint 23)
    path("zones/<int:pk>/readings/stream/", stream_zone_readings, name="zone-readings-stream"),
    path("orgs/<slug:slug>/retention-policy/", retention_policy_detail, name="retention-policy"),
    path("orgs/<slug:slug>/data-pipeline/", data_pipeline_status, name="data-pipeline-status"),
    # Sprint 24 — Multi-Site & Cartography
    path("sites/", site_list, name="site-list"),
    path("sites/dashboard/", site_dashboard, name="site-dashboard"),
    path("sites/<int:pk>/", site_detail, name="site-detail"),
    path("sites/<int:pk>/weather/", site_weather, name="site-weather"),
    path("sites/<int:pk>/weather/history/", site_weather_history, name="site-weather-history"),
    path("weather-alerts/", weather_alert_list, name="weather-alert-list"),
    path("weather-alerts/<int:pk>/acknowledge/", weather_alert_acknowledge, name="weather-alert-acknowledge"),
    path("zones/<int:pk>/weather-correlation/", weather_correlation, name="zone-weather-correlation"),
    # Sprint 25 — Compliance & Agricultural Traceability
    path("zones/<int:zone_id>/crop-cycles/", crop_cycle_list, name="crop-cycle-list"),
    path("crop-cycles/<int:pk>/", crop_cycle_detail, name="crop-cycle-detail"),
    path("zones/<int:zone_id>/notes/", note_list, name="note-list"),
    path("notes/<int:pk>/", note_detail, name="note-detail"),
    path("zones/<int:zone_id>/culture-journal/", culture_journal, name="culture-journal"),
    path("zones/<int:pk>/traceability/pdf/", traceability_pdf, name="traceability-pdf"),
    path("zones/<int:pk>/traceability/verify/", traceability_verify, name="traceability-verify"),
    path("zones/<int:pk>/globalgap/export/", globalgap_export, name="globalgap-export"),
    path("auth/gdpr/export/", gdpr_export, name="gdpr-export"),
    path("auth/gdpr/erasure/", gdpr_erasure, name="gdpr-erasure"),
    # Sprint 31 — Crop Intelligence
    path("zones/<int:pk>/crop-status/", zone_crop_status, name="zone-crop-status"),
    path(
        "zones/<int:pk>/crop-indicator-preferences/",
        zone_crop_indicator_preferences,
        name="zone-crop-indicator-preferences",
    ),
    # Sprint 27 — Edge Sync Agent
    path("sync/status/", SyncStatusView.as_view({"get": "list"}), name="sync-status"),
    path(
        "orgs/<slug:slug>/edge-devices/",
        EdgeDeviceViewSet.as_view({"get": "list", "post": "create"}),
        name="edge-device-list",
    ),
    path(
        "edge-devices/<str:device_id>/",
        EdgeDeviceViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
        name="edge-device-detail",
    ),
    path(
        "edge-devices/<str:device_id>/sync-history/",
        EdgeDeviceViewSet.as_view({"get": "sync_history"}),
        name="edge-device-sync-history",
    ),
]
