"""Tests for IoT API endpoints: CRUD, filtering, and user isolation."""

import factory
import pytest
from django.utils import timezone

from apps.iot.models import (
    Actuator,
    Alert,
    AutomationRule,
    Command,
    Sensor,
)
from conftest import (
    ActuatorFactory,
    AutomationRuleFactory,
    CommandFactory,
    GreenhouseFactory,
    SensorFactory,
    SensorReadingFactory,
    ZoneFactory,
)


class AlertFactory(factory.django.DjangoModelFactory):
    """Local factory for Alert instances."""

    class Meta:
        model = Alert

    zone = factory.SubFactory(ZoneFactory)
    alert_type = Alert.AlertType.THRESHOLD_HIGH
    severity = Alert.Severity.WARNING
    message = "Test alert"
    is_acknowledged = False


# ---------------------------------------------------------------------------
# Greenhouses
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGreenhouseViewSet:
    list_url = "/api/greenhouses/"

    def detail_url(self, pk):
        return f"/api/greenhouses/{pk}/"

    def test_list_requires_auth(self, api_client):
        assert api_client.get(self.list_url).status_code == 401

    def test_list_returns_only_owned(self, auth_client, user, other_user):
        GreenhouseFactory(owner=user)
        GreenhouseFactory(owner=other_user)
        response = auth_client.get(self.list_url)
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_create(self, auth_client, user):
        payload = {"name": "New GH", "location": "Lyon"}
        response = auth_client.post(self.list_url, payload)
        assert response.status_code == 201
        assert response.data["name"] == "New GH"

    def test_retrieve(self, auth_client, greenhouse):
        response = auth_client.get(self.detail_url(greenhouse.pk))
        assert response.status_code == 200
        assert response.data["id"] == greenhouse.pk

    def test_retrieve_other_users_greenhouse_denied(self, other_auth_client, greenhouse):
        response = other_auth_client.get(self.detail_url(greenhouse.pk))
        assert response.status_code == 404

    def test_partial_update(self, auth_client, greenhouse):
        response = auth_client.patch(self.detail_url(greenhouse.pk), {"name": "Updated"})
        assert response.status_code == 200
        assert response.data["name"] == "Updated"

    def test_delete(self, auth_client, greenhouse):
        response = auth_client.delete(self.detail_url(greenhouse.pk))
        assert response.status_code == 204


# ---------------------------------------------------------------------------
# Zones
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestZoneViewSet:

    def list_url(self, greenhouse_id):
        return f"/api/greenhouses/{greenhouse_id}/zones/"

    def detail_url(self, pk):
        return f"/api/zones/{pk}/"

    def test_list_zones(self, auth_client, greenhouse, zone):
        response = auth_client.get(self.list_url(greenhouse.pk))
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_create_zone(self, auth_client, greenhouse):
        payload = {"name": "Zone A", "relay_id": 50, "transmission_interval": 120}
        response = auth_client.post(self.list_url(greenhouse.pk), payload)
        assert response.status_code == 201
        assert response.data["relay_id"] == 50

    def test_patch_zone(self, auth_client, zone):
        response = auth_client.patch(self.detail_url(zone.pk), {"name": "Updated Zone"})
        assert response.status_code == 200

    def test_delete_zone(self, auth_client, zone):
        response = auth_client.delete(self.detail_url(zone.pk))
        assert response.status_code == 204

    def test_isolation_zone_list(self, other_auth_client, greenhouse):
        response = other_auth_client.get(self.list_url(greenhouse.pk))
        assert response.status_code == 404


@pytest.mark.django_db
class TestZoneExportCsv:
    """Tests for the GET /api/zones/{id}/export/csv/ endpoint."""

    def export_url(self, pk):
        return f"/api/zones/{pk}/export/csv/"

    def test_export_csv_returns_csv(self, auth_client, zone, sensor):
        SensorReadingFactory(sensor=sensor, value=22.5)
        SensorReadingFactory(sensor=sensor, value=23.1)
        response = auth_client.get(self.export_url(zone.pk))
        assert response.status_code == 200
        assert response["Content-Type"] == "text/csv"
        assert "attachment" in response["Content-Disposition"]
        content = response.content.decode()
        lines = content.strip().splitlines()
        assert lines[0] == "sensor_type,sensor_label,value,unit,received_at"
        assert len(lines) == 3  # header + 2 readings

    def test_export_csv_empty(self, auth_client, zone):
        response = auth_client.get(self.export_url(zone.pk))
        assert response.status_code == 200
        content = response.content.decode()
        lines = content.strip().splitlines()
        assert len(lines) == 1  # header only

    def test_export_csv_with_time_filter(self, auth_client, zone, sensor):
        SensorReadingFactory(sensor=sensor, value=20.0)
        response = auth_client.get(
            self.export_url(zone.pk),
            {"from": "2099-01-01T00:00:00+00:00"},
        )
        assert response.status_code == 200
        content = response.content.decode()
        lines = content.strip().splitlines()
        assert len(lines) == 1  # header only — future filter excludes all

    def test_export_csv_requires_auth(self, api_client, zone):
        response = api_client.get(self.export_url(zone.pk))
        assert response.status_code == 401

    def test_export_csv_isolation(self, other_auth_client, zone):
        response = other_auth_client.get(self.export_url(zone.pk))
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Sensors
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSensorViewSet:

    def list_url(self, zone_id):
        return f"/api/zones/{zone_id}/sensors/"

    def detail_url(self, pk):
        return f"/api/sensors/{pk}/"

    def readings_url(self, pk):
        return f"/api/sensors/{pk}/readings/"

    def test_list_sensors(self, auth_client, zone, sensor):
        response = auth_client.get(self.list_url(zone.pk))
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_create_sensor(self, auth_client, zone):
        payload = {
            "sensor_type": Sensor.SensorType.PH,
            "label": "pH probe",
            "unit": "pH",
        }
        response = auth_client.post(self.list_url(zone.pk), payload)
        assert response.status_code == 201

    def test_patch_sensor(self, auth_client, sensor):
        response = auth_client.patch(self.detail_url(sensor.pk), {"label": "Updated label"})
        assert response.status_code == 200

    def test_readings_empty(self, auth_client, sensor):
        response = auth_client.get(self.readings_url(sensor.pk))
        assert response.status_code == 200
        assert response.data["count"] == 0

    def test_readings_returns_data(self, auth_client, sensor):
        SensorReadingFactory(sensor=sensor, value=21.0)
        SensorReadingFactory(sensor=sensor, value=22.0)
        response = auth_client.get(self.readings_url(sensor.pk))
        assert response.data["count"] == 2

    def test_readings_from_filter(self, auth_client, sensor):
        from datetime import timedelta

        SensorReadingFactory(sensor=sensor, value=10.0)
        SensorReadingFactory(sensor=sensor, value=20.0)
        from_dt = (timezone.now() - timedelta(minutes=5)).isoformat()
        response = auth_client.get(self.readings_url(sensor.pk), {"from": from_dt})
        assert response.status_code == 200

    def test_readings_interval_hour(self, auth_client, sensor):
        """Aggregation with interval=hour returns avg_value and period."""
        SensorReadingFactory(sensor=sensor, value=20.0)
        SensorReadingFactory(sensor=sensor, value=24.0)
        response = auth_client.get(self.readings_url(sensor.pk), {"interval": "hour"})
        assert response.status_code == 200
        results = response.data["results"]
        assert len(results) >= 1
        assert "avg_value" in results[0]
        assert "period" in results[0]

    def test_readings_interval_day(self, auth_client, sensor):
        """Aggregation with interval=day returns avg_value."""
        SensorReadingFactory(sensor=sensor, value=10.0)
        SensorReadingFactory(sensor=sensor, value=30.0)
        response = auth_client.get(self.readings_url(sensor.pk), {"interval": "day"})
        assert response.status_code == 200
        results = response.data["results"]
        assert len(results) >= 1
        assert results[0]["avg_value"] == pytest.approx(20.0)

    def test_readings_interval_invalid(self, auth_client, sensor):
        """Invalid interval value returns 400."""
        response = auth_client.get(self.readings_url(sensor.pk), {"interval": "week"})
        assert response.status_code == 400

    def test_isolation_sensor_list(self, other_auth_client, zone):
        response = other_auth_client.get(self.list_url(zone.pk))
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Actuators
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestActuatorViewSet:

    def list_url(self, zone_id):
        return f"/api/zones/{zone_id}/actuators/"

    def detail_url(self, pk):
        return f"/api/actuators/{pk}/"

    def test_list_actuators(self, auth_client, zone, actuator):
        response = auth_client.get(self.list_url(zone.pk))
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_create_actuator(self, auth_client, zone):
        payload = {
            "actuator_type": Actuator.ActuatorType.FAN,
            "name": "Main Fan",
        }
        response = auth_client.post(self.list_url(zone.pk), payload)
        assert response.status_code == 201

    def test_patch_actuator(self, auth_client, actuator):
        response = auth_client.patch(self.detail_url(actuator.pk), {"name": "Updated Fan"})
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCommandViewSet:

    def create_url(self, actuator_id):
        return f"/api/actuators/{actuator_id}/commands/"

    def list_url(self, zone_id):
        return f"/api/zones/{zone_id}/commands/"

    def test_create_command(self, auth_client, actuator):
        payload = {"command_type": Command.CommandType.ON}
        response = auth_client.post(self.create_url(actuator.pk), payload)
        assert response.status_code == 201
        assert response.data["command_type"] == "ON"

    def test_list_commands_by_zone(self, auth_client, actuator, zone):
        CommandFactory(actuator=actuator)
        response = auth_client.get(self.list_url(zone.pk))
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_isolation_command_create(self, other_auth_client, actuator):
        payload = {"command_type": Command.CommandType.ON}
        response = other_auth_client.post(self.create_url(actuator.pk), payload)
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Automation Rules
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAutomationRuleViewSet:

    def list_url(self, zone_id):
        return f"/api/zones/{zone_id}/automations/"

    def detail_url(self, pk):
        return f"/api/automations/{pk}/"

    def test_list_automations(self, auth_client, zone, actuator):
        AutomationRuleFactory(zone=zone, action_actuator=actuator)
        response = auth_client.get(self.list_url(zone.pk))
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_create_automation(self, auth_client, zone, actuator):
        payload = {
            "name": "Rule 1",
            "sensor_type": Sensor.SensorType.TEMPERATURE,
            "condition": AutomationRule.Condition.GREATER_THAN,
            "threshold_value": 30.0,
            "action_actuator": actuator.pk,
            "action_command_type": Command.CommandType.ON,
            "cooldown_seconds": 300,
        }
        response = auth_client.post(self.list_url(zone.pk), payload)
        assert response.status_code == 201

    def test_patch_automation(self, auth_client, zone, actuator):
        rule = AutomationRuleFactory(zone=zone, action_actuator=actuator)
        response = auth_client.patch(self.detail_url(rule.pk), {"threshold_value": 35.0})
        assert response.status_code == 200

    def test_delete_automation(self, auth_client, zone, actuator):
        rule = AutomationRuleFactory(zone=zone, action_actuator=actuator)
        response = auth_client.delete(self.detail_url(rule.pk))
        assert response.status_code == 204


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAlertViewSet:

    list_url = "/api/alerts/"

    def acknowledge_url(self, pk):
        return f"/api/alerts/{pk}/acknowledge/"

    def test_list_alerts_empty(self, auth_client):
        response = auth_client.get(self.list_url)
        assert response.status_code == 200
        assert response.data["count"] == 0

    def test_list_alerts_own_zones(self, auth_client, zone):
        AlertFactory(zone=zone)
        response = auth_client.get(self.list_url)
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_alert_isolation(self, other_auth_client, zone):
        AlertFactory(zone=zone)
        response = other_auth_client.get(self.list_url)
        assert response.status_code == 200
        assert response.data["count"] == 0

    def test_filter_by_severity(self, auth_client, zone):
        AlertFactory(zone=zone, severity=Alert.Severity.CRITICAL)
        AlertFactory(zone=zone, severity=Alert.Severity.INFO)
        response = auth_client.get(self.list_url, {"severity": "CRITICAL"})
        assert response.data["count"] == 1

    def test_acknowledge_alert(self, auth_client, zone):
        alert = AlertFactory(zone=zone)
        response = auth_client.patch(self.acknowledge_url(alert.pk))
        assert response.status_code == 200
        assert response.data["is_acknowledged"] is True

    def test_double_acknowledge_denied(self, auth_client, zone):
        alert = AlertFactory(zone=zone, is_acknowledged=True)
        response = auth_client.patch(self.acknowledge_url(alert.pk))
        assert response.status_code == 400

    def test_acknowledge_other_users_alert_denied(self, other_auth_client, zone):
        alert = AlertFactory(zone=zone)
        response = other_auth_client.patch(self.acknowledge_url(alert.pk))
        assert response.status_code == 404
