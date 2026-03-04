"""URL configuration for the IoT app."""

from django.urls import path

from .views import (
    ActuatorViewSet,
    AlertViewSet,
    AutomationRuleViewSet,
    CommandViewSet,
    GreenhouseViewSet,
    NotificationChannelViewSet,
    NotificationLogViewSet,
    NotificationRuleViewSet,
    OrgAnalyticsSummaryView,
    ScenarioViewSet,
    ScheduleViewSet,
    SensorViewSet,
    ZoneAnalyticsView,
    ZoneReportPDFView,
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
]
