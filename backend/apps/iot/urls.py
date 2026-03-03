"""URL configuration for the IoT app."""

from django.urls import path

from .views import (
    ActuatorViewSet,
    AlertViewSet,
    AutomationRuleViewSet,
    CommandViewSet,
    GreenhouseViewSet,
    SensorViewSet,
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
sensor_detail = SensorViewSet.as_view({"patch": "partial_update"})
sensor_readings = SensorViewSet.as_view({"get": "readings"})

actuator_list = ActuatorViewSet.as_view({"get": "list", "post": "create"})
actuator_detail = ActuatorViewSet.as_view({"patch": "partial_update"})

command_create = CommandViewSet.as_view({"post": "create"})
command_list_by_zone = CommandViewSet.as_view({"get": "list"})

automation_list = AutomationRuleViewSet.as_view({"get": "list", "post": "create"})
automation_detail = AutomationRuleViewSet.as_view(
    {"patch": "partial_update", "delete": "destroy"}
)

alert_list = AlertViewSet.as_view({"get": "list"})
alert_acknowledge = AlertViewSet.as_view({"patch": "acknowledge"})

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
]
