"""Tests for Template, TemplateCategory, and TemplateRating marketplace API."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Actuator,
    AutomationRule,
    Greenhouse,
    Scenario,
    ScenarioStep,
    Sensor,
    Template,
    TemplateCategory,
    TemplateRating,
    Zone,
)
from apps.iot.views import _import_template_to_zone, _snapshot_zone_config

User = get_user_model()


SAMPLE_CONFIG = {
    "sensors": [
        {"sensor_type": "TEMP", "label": "Air Temp", "unit": "°C", "min_threshold": 15.0, "max_threshold": 30.0},
        {"sensor_type": "HUM_AIR", "label": "Air Humidity", "unit": "%", "min_threshold": 50.0, "max_threshold": 80.0},
    ],
    "actuators": [
        {"actuator_type": "VALVE", "name": "Drip Valve", "gpio_pin": 4},
        {"actuator_type": "FAN", "name": "Vent Fan", "gpio_pin": 5},
    ],
    "automation_rules": [
        {
            "name": "Low moisture irrigation",
            "description": "Water when dry",
            "sensor_type": "HUM_AIR",
            "condition": "LT",
            "threshold_value": 50.0,
            "action_actuator_name": "Drip Valve",
            "action_actuator_type": "VALVE",
            "action_command_type": "ON",
            "action_value": None,
            "cooldown_seconds": 600,
        },
    ],
    "scenarios": [
        {
            "name": "Morning Watering",
            "description": "20 min drip cycle",
            "steps": [
                {
                    "order": 0,
                    "action": "ON",
                    "action_value": None,
                    "delay_seconds": 0,
                    "duration_seconds": 1200,
                    "actuator_name": "Drip Valve",
                    "actuator_type": "VALVE",
                },
            ],
        },
    ],
}


class TemplateTestBase(TestCase):
    """Shared setUp for marketplace template tests."""

    def setUp(self):
        self.user = User.objects.create_user(username="tmpluser", password="testpass123")
        self.org = Organization.objects.create(name="TmplOrg", slug="tmplorg")
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.OWNER)

        self.greenhouse = Greenhouse.objects.create(name="GH1", organization=self.org, owner=self.user)
        self.zone = Zone.objects.create(greenhouse=self.greenhouse, name="Zone1", relay_id=200)
        self.actuator_valve = Actuator.objects.create(
            zone=self.zone, actuator_type="VALVE", name="Drip Valve", gpio_pin=4
        )
        self.actuator_fan = Actuator.objects.create(
            zone=self.zone, actuator_type="FAN", name="Vent Fan", gpio_pin=5
        )
        self.sensor_temp = Sensor.objects.create(
            zone=self.zone, sensor_type="TEMP", label="Air Temp", unit="°C",
            min_threshold=15.0, max_threshold=30.0,
        )
        self.sensor_hum = Sensor.objects.create(
            zone=self.zone, sensor_type="HUM_AIR", label="Air Humidity", unit="%",
            min_threshold=50.0, max_threshold=80.0,
        )

        self.category = TemplateCategory.objects.create(
            name="Vegetables", slug="vegetables", icon="leaf", order=1
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Second user / org for cross-org tests
        self.user2 = User.objects.create_user(username="tmpluser2", password="testpass123")
        self.org2 = Organization.objects.create(name="OtherOrg", slug="otherorg")
        Membership.objects.create(user=self.user2, organization=self.org2, role=Membership.Role.OWNER)
        self.greenhouse2 = Greenhouse.objects.create(name="GH2", organization=self.org2, owner=self.user2)
        self.zone2 = Zone.objects.create(greenhouse=self.greenhouse2, name="Zone2", relay_id=201)


# ---------------------------------------------------------------------------
# Template Category tests
# ---------------------------------------------------------------------------
class TestTemplateCategoryAPI(TemplateTestBase):
    """Tests for the TemplateCategoryViewSet."""

    def test_list_categories(self):
        TemplateCategory.objects.create(name="Fruits", slug="fruits", icon="apple", order=2)
        resp = self.client.get("/api/templates/categories/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data["results"]
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["name"], "Vegetables")

    def test_category_template_count(self):
        """template_count should only count published templates."""
        Template.objects.create(name="T1", category=self.category, is_published=True, config={})
        Template.objects.create(name="T2", category=self.category, is_published=False, config={})
        resp = self.client.get("/api/templates/categories/")
        self.assertEqual(resp.data["results"][0]["template_count"], 1)

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get("/api/templates/categories/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Template CRUD tests
# ---------------------------------------------------------------------------
class TestTemplateCRUD(TemplateTestBase):
    """Tests for basic Template CRUD operations."""

    def test_create_template(self):
        payload = {
            "name": "My Template",
            "description": "A test template",
            "category": self.category.pk,
            "version": "1.0.0",
            "config": SAMPLE_CONFIG,
        }
        resp = self.client.post("/api/templates/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "My Template")
        self.assertEqual(resp.data["organization"], self.org.pk)
        self.assertEqual(resp.data["created_by"], self.user.pk)
        self.assertEqual(resp.data["version"], "1.0.0")

    def test_create_template_invalid_config_key(self):
        payload = {
            "name": "Bad Config",
            "config": {"sensors": [], "bad_key": []},
        }
        resp = self.client.post("/api/templates/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_templates_shows_only_published(self):
        Template.objects.create(name="Published", is_published=True, config={})
        Template.objects.create(name="Unpublished", is_published=False, config={})
        resp = self.client.get("/api/templates/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = [t["name"] for t in resp.data["results"]]
        self.assertIn("Published", names)
        self.assertNotIn("Unpublished", names)

    def test_retrieve_template(self):
        tmpl = Template.objects.create(
            name="Detail", category=self.category, config=SAMPLE_CONFIG,
            organization=self.org, created_by=self.user,
        )
        resp = self.client.get(f"/api/templates/{tmpl.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Detail")
        self.assertEqual(resp.data["organization_name"], "TmplOrg")
        self.assertEqual(resp.data["category_name"], "Vegetables")
        self.assertEqual(resp.data["created_by_username"], "tmpluser")

    def test_update_own_template(self):
        tmpl = Template.objects.create(
            name="OldName", config={}, organization=self.org, created_by=self.user,
        )
        resp = self.client.patch(f"/api/templates/{tmpl.pk}/", {"name": "NewName"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "NewName")

    def test_update_other_org_template_forbidden(self):
        tmpl = Template.objects.create(
            name="Others", config={}, organization=self.org2, created_by=self.user2,
        )
        resp = self.client.patch(f"/api/templates/{tmpl.pk}/", {"name": "Hacked"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_own_template(self):
        tmpl = Template.objects.create(
            name="ToDelete", config={}, organization=self.org, created_by=self.user,
        )
        resp = self.client.delete(f"/api/templates/{tmpl.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Template.objects.filter(pk=tmpl.pk).exists())

    def test_delete_other_org_template_forbidden(self):
        tmpl = Template.objects.create(
            name="OthersDelete", config={}, organization=self.org2, created_by=self.user2,
        )
        resp = self.client.delete(f"/api/templates/{tmpl.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_by_category(self):
        cat2 = TemplateCategory.objects.create(name="Fruits", slug="fruits", order=2)
        Template.objects.create(name="Veg", category=self.category, is_published=True, config={})
        Template.objects.create(name="Fruit", category=cat2, is_published=True, config={})
        resp = self.client.get(f"/api/templates/?category={self.category.pk}")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["name"], "Veg")

    def test_filter_by_is_official(self):
        Template.objects.create(name="Official", is_official=True, is_published=True, config={})
        Template.objects.create(name="Community", is_official=False, is_published=True, config={})
        resp = self.client.get("/api/templates/?is_official=true")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["name"], "Official")

    def test_search_templates(self):
        Template.objects.create(name="Tomato Greenhouse", is_published=True, config={})
        Template.objects.create(name="Lettuce Production", is_published=True, config={})
        resp = self.client.get("/api/templates/?search=Tomato")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["name"], "Tomato Greenhouse")

    def test_ordering_templates(self):
        Template.objects.create(name="Low", avg_rating=2.0, is_published=True, config={})
        Template.objects.create(name="High", avg_rating=4.5, is_published=True, config={})
        resp = self.client.get("/api/templates/?ordering=-avg_rating")
        names = [t["name"] for t in resp.data["results"]]
        self.assertEqual(names, ["High", "Low"])


# ---------------------------------------------------------------------------
# Template Clone tests
# ---------------------------------------------------------------------------
class TestTemplateClone(TemplateTestBase):
    """Tests for template clone (import) into a zone."""

    def _create_template(self, config=None):
        return Template.objects.create(
            name="Clone Source",
            config=config or SAMPLE_CONFIG,
            organization=self.org,
            created_by=self.user,
            is_published=True,
        )

    def test_clone_merge_mode(self):
        tmpl = self._create_template()
        # Zone already has sensors but no automation_rules or scenarios
        resp = self.client.post(
            f"/api/templates/{tmpl.pk}/clone/",
            {"zone_id": self.zone.pk, "mode": "merge"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        # In merge mode: existing sensors (TEMP, HUM_AIR) already exist, so 0 new sensors
        self.assertEqual(resp.data["summary"]["sensors"], 0)
        # Existing actuators (Drip Valve, Vent Fan) already exist, so 0 new actuators
        self.assertEqual(resp.data["summary"]["actuators"], 0)
        # Automation rules are new → 1 created
        self.assertEqual(resp.data["summary"]["automation_rules"], 1)
        # Scenarios are new → 1 created
        self.assertEqual(resp.data["summary"]["scenarios"], 1)
        # Verify clone count incremented
        tmpl.refresh_from_db()
        self.assertEqual(tmpl.clone_count, 1)

    def test_clone_replace_mode(self):
        tmpl = self._create_template()
        # Add an extra sensor that should be deleted in replace mode
        Sensor.objects.create(zone=self.zone, sensor_type="PH", label="pH", unit="pH")
        self.assertEqual(self.zone.sensors.count(), 3)

        resp = self.client.post(
            f"/api/templates/{tmpl.pk}/clone/",
            {"zone_id": self.zone.pk, "mode": "replace"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        # Replace deletes all first, then creates from config
        self.assertEqual(resp.data["summary"]["sensors"], 2)
        self.assertEqual(resp.data["summary"]["actuators"], 2)
        self.assertEqual(resp.data["summary"]["automation_rules"], 1)
        self.assertEqual(resp.data["summary"]["scenarios"], 1)
        # PH sensor gone since we replaced
        self.assertFalse(self.zone.sensors.filter(sensor_type="PH").exists())
        # Now has exactly what the template defines
        self.assertEqual(self.zone.sensors.count(), 2)
        self.assertEqual(self.zone.actuators.count(), 2)

    def test_clone_default_mode_is_merge(self):
        tmpl = self._create_template()
        resp = self.client.post(
            f"/api/templates/{tmpl.pk}/clone/",
            {"zone_id": self.zone.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("merge", resp.data["detail"])

    def test_clone_missing_zone_id(self):
        tmpl = self._create_template()
        resp = self.client.post(f"/api/templates/{tmpl.pk}/clone/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_clone_to_other_org_zone_forbidden(self):
        tmpl = self._create_template()
        resp = self.client.post(
            f"/api/templates/{tmpl.pk}/clone/",
            {"zone_id": self.zone2.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_clone_increments_count(self):
        tmpl = self._create_template()
        self.assertEqual(tmpl.clone_count, 0)
        self.client.post(
            f"/api/templates/{tmpl.pk}/clone/",
            {"zone_id": self.zone.pk, "mode": "replace"},
            format="json",
        )
        self.client.post(
            f"/api/templates/{tmpl.pk}/clone/",
            {"zone_id": self.zone.pk, "mode": "replace"},
            format="json",
        )
        tmpl.refresh_from_db()
        self.assertEqual(tmpl.clone_count, 2)


# ---------------------------------------------------------------------------
# Template Rating tests
# ---------------------------------------------------------------------------
class TestTemplateRating(TemplateTestBase):
    """Tests for template rating (create, update, average recalculation)."""

    def setUp(self):
        super().setUp()
        self.template = Template.objects.create(
            name="Rate Me", config={}, is_published=True,
            organization=self.org, created_by=self.user,
        )

    def test_rate_template(self):
        resp = self.client.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 4, "comment": "Great template!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.template.refresh_from_db()
        self.assertEqual(self.template.avg_rating, 4.0)
        self.assertEqual(self.template.rating_count, 1)

    def test_update_existing_rating(self):
        self.client.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 3}, format="json",
        )
        self.client.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 5}, format="json",
        )
        self.template.refresh_from_db()
        # Should have updated not created a second rating
        self.assertEqual(self.template.rating_count, 1)
        self.assertEqual(self.template.avg_rating, 5.0)

    def test_average_rating_multiple_users(self):
        # User 1 rates 4
        self.client.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 4}, format="json",
        )
        # User 2 rates 2
        client2 = APIClient()
        client2.force_authenticate(user=self.user2)
        client2.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 2}, format="json",
        )
        self.template.refresh_from_db()
        self.assertEqual(self.template.rating_count, 2)
        self.assertEqual(self.template.avg_rating, 3.0)

    def test_rate_invalid_score_too_high(self):
        resp = self.client.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 6}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rate_invalid_score_too_low(self):
        resp = self.client.post(
            f"/api/templates/{self.template.pk}/rate/",
            {"score": 0}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_ratings(self):
        TemplateRating.objects.create(template=self.template, user=self.user, score=4, comment="Good")
        TemplateRating.objects.create(template=self.template, user=self.user2, score=5, comment="Excellent")
        resp = self.client.get(f"/api/templates/{self.template.pk}/ratings/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)

    def test_user_rating_field_in_template_detail(self):
        TemplateRating.objects.create(template=self.template, user=self.user, score=3)
        resp = self.client.get(f"/api/templates/{self.template.pk}/")
        self.assertEqual(resp.data["user_rating"], 3)

    def test_user_rating_field_null_when_not_rated(self):
        resp = self.client.get(f"/api/templates/{self.template.pk}/")
        self.assertIsNone(resp.data["user_rating"])


# ---------------------------------------------------------------------------
# Publish from Zone tests
# ---------------------------------------------------------------------------
class TestPublishTemplate(TemplateTestBase):
    """Tests for publishing a zone's configuration as a template."""

    def setUp(self):
        super().setUp()
        # Add an automation rule and scenario to be snapshotted
        self.rule = AutomationRule.objects.create(
            zone=self.zone,
            name="Heat Rule",
            sensor_type="TEMP",
            condition="GT",
            threshold_value=30.0,
            action_actuator=self.actuator_fan,
            action_command_type="ON",
            cooldown_seconds=300,
        )
        self.scenario = Scenario.objects.create(zone=self.zone, name="Water Cycle")
        self.step = ScenarioStep.objects.create(
            scenario=self.scenario,
            actuator=self.actuator_valve,
            order=0,
            action="ON",
            delay_seconds=0,
            duration_seconds=600,
        )

    def test_publish_zone_as_template(self):
        payload = {
            "name": "My Published Template",
            "description": "From my zone setup",
            "category": self.category.pk,
            "version": "1.0.0",
        }
        resp = self.client.post(
            f"/api/zones/{self.zone.pk}/publish-template/",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "My Published Template")
        self.assertEqual(resp.data["organization"], self.org.pk)
        config = resp.data["config"]
        self.assertEqual(len(config["sensors"]), 2)
        self.assertEqual(len(config["actuators"]), 2)
        self.assertEqual(len(config["automation_rules"]), 1)
        self.assertEqual(len(config["scenarios"]), 1)
        self.assertEqual(config["scenarios"][0]["steps"][0]["actuator_name"], "Drip Valve")

    def test_publish_without_name_fails(self):
        resp = self.client.post(
            f"/api/zones/{self.zone.pk}/publish-template/",
            {"description": "No name"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_publish_other_org_zone_forbidden(self):
        payload = {"name": "Stolen Template"}
        resp = self.client.post(
            f"/api/zones/{self.zone2.pk}/publish-template/",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Snapshot & Import helper function tests
# ---------------------------------------------------------------------------
class TestSnapshotZoneConfig(TemplateTestBase):
    """Tests for the _snapshot_zone_config helper."""

    def setUp(self):
        super().setUp()
        self.rule = AutomationRule.objects.create(
            zone=self.zone,
            name="Snapshot Rule",
            sensor_type="TEMP",
            condition="LT",
            threshold_value=15.0,
            action_actuator=self.actuator_valve,
            action_command_type="ON",
            cooldown_seconds=600,
        )
        self.scenario = Scenario.objects.create(zone=self.zone, name="Snap Scenario")
        self.step = ScenarioStep.objects.create(
            scenario=self.scenario,
            actuator=self.actuator_fan,
            order=0,
            action="ON",
            delay_seconds=10,
            duration_seconds=300,
        )

    def test_snapshot_captures_sensors(self):
        config = _snapshot_zone_config(self.zone)
        self.assertEqual(len(config["sensors"]), 2)
        types = {s["sensor_type"] for s in config["sensors"]}
        self.assertEqual(types, {"TEMP", "HUM_AIR"})

    def test_snapshot_captures_actuators(self):
        config = _snapshot_zone_config(self.zone)
        self.assertEqual(len(config["actuators"]), 2)
        names = {a["name"] for a in config["actuators"]}
        self.assertEqual(names, {"Drip Valve", "Vent Fan"})

    def test_snapshot_captures_automation_rules(self):
        config = _snapshot_zone_config(self.zone)
        self.assertEqual(len(config["automation_rules"]), 1)
        rule = config["automation_rules"][0]
        self.assertEqual(rule["name"], "Snapshot Rule")
        self.assertEqual(rule["action_actuator_name"], "Drip Valve")
        self.assertEqual(rule["action_actuator_type"], "VALVE")

    def test_snapshot_captures_scenarios_with_steps(self):
        config = _snapshot_zone_config(self.zone)
        self.assertEqual(len(config["scenarios"]), 1)
        self.assertEqual(config["scenarios"][0]["name"], "Snap Scenario")
        steps = config["scenarios"][0]["steps"]
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["actuator_name"], "Vent Fan")
        self.assertEqual(steps[0]["actuator_type"], "FAN")
        self.assertEqual(steps[0]["delay_seconds"], 10)
        self.assertEqual(steps[0]["duration_seconds"], 300)

    def test_snapshot_empty_zone(self):
        empty_zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="EmptyZone", relay_id=250
        )
        config = _snapshot_zone_config(empty_zone)
        self.assertEqual(config["sensors"], [])
        self.assertEqual(config["actuators"], [])
        self.assertEqual(config["automation_rules"], [])
        self.assertEqual(config["scenarios"], [])


class TestImportTemplateToZone(TemplateTestBase):
    """Tests for the _import_template_to_zone helper."""

    def test_import_replace_mode_on_empty_zone(self):
        empty_zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="EmptyImport", relay_id=210
        )
        summary = _import_template_to_zone(empty_zone, SAMPLE_CONFIG, "replace", self.user)
        self.assertEqual(summary["sensors"], 2)
        self.assertEqual(summary["actuators"], 2)
        self.assertEqual(summary["automation_rules"], 1)
        self.assertEqual(summary["scenarios"], 1)
        self.assertEqual(empty_zone.sensors.count(), 2)
        self.assertEqual(empty_zone.actuators.count(), 2)
        self.assertEqual(empty_zone.automation_rules.count(), 1)
        self.assertEqual(empty_zone.scenarios.count(), 1)

    def test_import_merge_skips_existing(self):
        summary = _import_template_to_zone(self.zone, SAMPLE_CONFIG, "merge", self.user)
        # Zone already has TEMP and HUM_AIR sensors → 0 new
        self.assertEqual(summary["sensors"], 0)
        # Zone already has Drip Valve and Vent Fan → 0 new
        self.assertEqual(summary["actuators"], 0)
        # Automation rules and scenarios are new
        self.assertEqual(summary["automation_rules"], 1)
        self.assertEqual(summary["scenarios"], 1)

    def test_import_merge_adds_missing_sensors(self):
        config = {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Temp", "unit": "°C"},
                {"sensor_type": "PH", "label": "pH Level", "unit": "pH"},
            ],
            "actuators": [],
            "automation_rules": [],
            "scenarios": [],
        }
        summary = _import_template_to_zone(self.zone, config, "merge", self.user)
        # TEMP exists, PH is new
        self.assertEqual(summary["sensors"], 1)
        self.assertTrue(self.zone.sensors.filter(sensor_type="PH").exists())

    def test_import_replace_wipes_existing(self):
        # Zone starts with 2 sensors and 2 actuators
        self.assertEqual(self.zone.sensors.count(), 2)
        self.assertEqual(self.zone.actuators.count(), 2)

        config = {
            "sensors": [{"sensor_type": "CO2", "label": "CO2", "unit": "ppm"}],
            "actuators": [{"actuator_type": "PUMP", "name": "Pump1", "gpio_pin": 10}],
            "automation_rules": [],
            "scenarios": [],
        }
        summary = _import_template_to_zone(self.zone, config, "replace", self.user)
        self.assertEqual(summary["sensors"], 1)
        self.assertEqual(summary["actuators"], 1)
        self.assertEqual(self.zone.sensors.count(), 1)
        self.assertEqual(self.zone.actuators.count(), 1)
        self.assertEqual(self.zone.sensors.first().sensor_type, "CO2")

    def test_import_automation_rule_links_to_actuator(self):
        empty_zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="RuleLinkZone", relay_id=211
        )
        _import_template_to_zone(empty_zone, SAMPLE_CONFIG, "replace", self.user)
        rule = empty_zone.automation_rules.first()
        self.assertIsNotNone(rule)
        self.assertEqual(rule.action_actuator.name, "Drip Valve")

    def test_import_scenario_step_links_to_actuator(self):
        empty_zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="StepLinkZone", relay_id=212
        )
        _import_template_to_zone(empty_zone, SAMPLE_CONFIG, "replace", self.user)
        scenario = empty_zone.scenarios.first()
        self.assertIsNotNone(scenario)
        step = scenario.steps.first()
        self.assertIsNotNone(step)
        self.assertEqual(step.actuator.name, "Drip Valve")
        self.assertEqual(step.duration_seconds, 1200)

    def test_import_skips_rule_if_actuator_missing(self):
        config = {
            "sensors": [],
            "actuators": [],
            "automation_rules": [
                {
                    "name": "Orphan Rule",
                    "description": "",
                    "sensor_type": "TEMP",
                    "condition": "GT",
                    "threshold_value": 30.0,
                    "action_actuator_name": "NonExistentActuator",
                    "action_actuator_type": "VALVE",
                    "action_command_type": "ON",
                    "cooldown_seconds": 300,
                },
            ],
            "scenarios": [],
        }
        empty_zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="OrphanZone", relay_id=213
        )
        summary = _import_template_to_zone(empty_zone, config, "replace", self.user)
        # Rule should be skipped since no matching actuator exists
        self.assertEqual(summary["automation_rules"], 0)
        self.assertEqual(empty_zone.automation_rules.count(), 0)

    def test_import_empty_config(self):
        summary = _import_template_to_zone(self.zone, {}, "merge", self.user)
        self.assertEqual(summary, {"sensors": 0, "actuators": 0, "automation_rules": 0, "scenarios": 0})


# ---------------------------------------------------------------------------
# Roundtrip test: publish → clone
# ---------------------------------------------------------------------------
class TestTemplateRoundtrip(TemplateTestBase):
    """End-to-end test: snapshot zone → publish → clone into empty zone."""

    def test_full_roundtrip(self):
        # Setup source zone with automation + scenario
        rule = AutomationRule.objects.create(
            zone=self.zone,
            name="RT Rule",
            sensor_type="TEMP",
            condition="GT",
            threshold_value=28.0,
            action_actuator=self.actuator_fan,
            action_command_type="ON",
            cooldown_seconds=300,
        )
        scenario = Scenario.objects.create(zone=self.zone, name="RT Scenario")
        ScenarioStep.objects.create(
            scenario=scenario,
            actuator=self.actuator_valve,
            order=0,
            action="ON",
            delay_seconds=0,
            duration_seconds=900,
        )

        # Step 1: Publish zone as template
        publish_resp = self.client.post(
            f"/api/zones/{self.zone.pk}/publish-template/",
            {"name": "Roundtrip Template", "category": self.category.pk},
            format="json",
        )
        self.assertEqual(publish_resp.status_code, status.HTTP_201_CREATED)
        tmpl_id = publish_resp.data["id"]

        # Step 2: Clone into empty zone (replace mode)
        target_zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="TargetZone", relay_id=220
        )
        clone_resp = self.client.post(
            f"/api/templates/{tmpl_id}/clone/",
            {"zone_id": target_zone.pk, "mode": "replace"},
            format="json",
        )
        self.assertEqual(clone_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(clone_resp.data["summary"]["sensors"], 2)
        self.assertEqual(clone_resp.data["summary"]["actuators"], 2)
        self.assertEqual(clone_resp.data["summary"]["automation_rules"], 1)
        self.assertEqual(clone_resp.data["summary"]["scenarios"], 1)

        # Verify target zone has correct resources
        self.assertEqual(target_zone.sensors.count(), 2)
        self.assertEqual(target_zone.actuators.count(), 2)
        self.assertEqual(target_zone.automation_rules.count(), 1)
        self.assertEqual(target_zone.scenarios.count(), 1)
        self.assertEqual(target_zone.automation_rules.first().action_actuator.name, "Vent Fan")
        self.assertEqual(target_zone.scenarios.first().steps.first().actuator.name, "Drip Valve")


# ---------------------------------------------------------------------------
# Seed data management command test
# ---------------------------------------------------------------------------
class TestSeedTemplatesCommand(TestCase):
    """Tests for the seed_templates management command."""

    def test_seed_creates_categories_and_templates(self):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("seed_templates", stdout=out)
        self.assertEqual(TemplateCategory.objects.count(), 6)
        self.assertEqual(Template.objects.filter(is_official=True).count(), 7)

    def test_seed_idempotent(self):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("seed_templates", stdout=out)
        call_command("seed_templates", stdout=out)
        # Running twice should not create duplicates
        self.assertEqual(TemplateCategory.objects.count(), 6)
        self.assertEqual(Template.objects.filter(is_official=True).count(), 7)

    def test_seed_flush_and_reseed(self):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("seed_templates", stdout=out)
        call_command("seed_templates", "--flush", stdout=out)
        self.assertEqual(TemplateCategory.objects.count(), 6)
        self.assertEqual(Template.objects.filter(is_official=True).count(), 7)
