"""Tests for Scenario, Schedule, and ScenarioStep API + tasks."""

from datetime import time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Actuator,
    Command,
    Greenhouse,
    Scenario,
    ScenarioStep,
    Schedule,
    Zone,
)
from apps.iot.tasks import _cron_matches, check_schedules_task, execute_scenario_task

User = get_user_model()


class ScenarioTestBase(TestCase):
    """Shared setup for scenario tests."""

    def setUp(self):
        self.user = User.objects.create_user(username="scnuser", password="testpass123")
        self.org = Organization.objects.create(name="ScnOrg", slug="scnorg")
        Membership.objects.create(
            user=self.user,
            organization=self.org,
            role=Membership.Role.OWNER,
        )
        self.greenhouse = Greenhouse.objects.create(
            name="GH1", organization=self.org, owner=self.user
        )
        self.zone = Zone.objects.create(
            greenhouse=self.greenhouse, name="Zone1", relay_id=80
        )
        self.actuator1 = Actuator.objects.create(
            zone=self.zone, actuator_type="VALVE", name="Valve1", gpio_pin=5
        )
        self.actuator2 = Actuator.objects.create(
            zone=self.zone, actuator_type="FAN", name="Fan1", gpio_pin=6
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)


class TestScenarioCRUD(ScenarioTestBase):
    """Tests for Scenario CRUD endpoints."""

    def test_create_scenario_with_steps(self):
        payload = {
            "name": "Morning Watering",
            "description": "Water all plants in the morning",
            "steps": [
                {"actuator": self.actuator1.pk, "order": 0, "action": "ON", "delay_seconds": 0, "duration_seconds": 300},
                {"actuator": self.actuator2.pk, "order": 1, "action": "ON", "delay_seconds": 60},
            ],
        }
        resp = self.client.post(f"/api/zones/{self.zone.pk}/scenarios/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "Morning Watering")
        self.assertEqual(len(resp.data["steps"]), 2)
        self.assertEqual(resp.data["status"], "IDLE")

    def test_create_scenario_empty_steps(self):
        payload = {"name": "Empty Scenario"}
        resp = self.client.post(f"/api/zones/{self.zone.pk}/scenarios/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data["steps"]), 0)

    def test_list_scenarios(self):
        Scenario.objects.create(zone=self.zone, name="S1")
        Scenario.objects.create(zone=self.zone, name="S2")
        resp = self.client.get(f"/api/zones/{self.zone.pk}/scenarios/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_update_scenario_replaces_steps(self):
        scenario = Scenario.objects.create(zone=self.zone, name="Old")
        ScenarioStep.objects.create(scenario=scenario, actuator=self.actuator1, order=0, action="ON")

        payload = {
            "name": "Updated",
            "steps": [
                {"actuator": self.actuator2.pk, "order": 0, "action": "OFF"},
            ],
        }
        resp = self.client.patch(f"/api/scenarios/{scenario.pk}/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Updated")
        self.assertEqual(len(resp.data["steps"]), 1)
        self.assertEqual(resp.data["steps"][0]["actuator"], self.actuator2.pk)

    def test_delete_scenario(self):
        scenario = Scenario.objects.create(zone=self.zone, name="ToDelete")
        resp = self.client.delete(f"/api/scenarios/{scenario.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Scenario.objects.filter(pk=scenario.pk).exists())

    def test_duplicate_step_orders_rejected(self):
        payload = {
            "name": "Dup Orders",
            "steps": [
                {"actuator": self.actuator1.pk, "order": 0, "action": "ON"},
                {"actuator": self.actuator2.pk, "order": 0, "action": "OFF"},
            ],
        }
        resp = self.client.post(f"/api/zones/{self.zone.pk}/scenarios/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthorized_user(self):
        other = User.objects.create_user(username="other", password="pass123")
        client2 = APIClient()
        client2.force_authenticate(user=other)
        resp = client2.get(f"/api/zones/{self.zone.pk}/scenarios/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class TestScenarioRunNow(ScenarioTestBase):
    """Tests for the run_now action."""

    @patch("apps.iot.tasks.execute_scenario_task.delay")
    def test_run_now_success(self, mock_delay):
        scenario = Scenario.objects.create(zone=self.zone, name="S1")
        ScenarioStep.objects.create(scenario=scenario, actuator=self.actuator1, order=0, action="ON")
        resp = self.client.post(f"/api/scenarios/{scenario.pk}/run/")
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        mock_delay.assert_called_once_with(scenario.pk, self.user.pk)

    def test_run_now_already_running(self):
        scenario = Scenario.objects.create(zone=self.zone, name="S1", status=Scenario.Status.RUNNING)
        resp = self.client.post(f"/api/scenarios/{scenario.pk}/run/")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("already running", resp.data["detail"])

    @patch("apps.iot.tasks.execute_scenario_task.delay")
    def test_run_now_actuator_conflict(self, mock_delay):
        # Create a running scenario that uses actuator1
        running = Scenario.objects.create(zone=self.zone, name="Running", status=Scenario.Status.RUNNING)
        ScenarioStep.objects.create(scenario=running, actuator=self.actuator1, order=0, action="ON")

        # Try to run another scenario that also uses actuator1
        new_scenario = Scenario.objects.create(zone=self.zone, name="New")
        ScenarioStep.objects.create(scenario=new_scenario, actuator=self.actuator1, order=0, action="OFF")

        resp = self.client.post(f"/api/scenarios/{new_scenario.pk}/run/")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("conflict", resp.data["detail"].lower())
        mock_delay.assert_not_called()


class TestScheduleCRUD(ScenarioTestBase):
    """Tests for Schedule CRUD endpoints."""

    def test_create_cron_schedule(self):
        scenario = Scenario.objects.create(zone=self.zone, name="S1")
        payload = {
            "scenario": scenario.pk,
            "name": "Every morning at 6AM",
            "schedule_type": "CRON",
            "cron_minute": "0",
            "cron_hour": "6",
            "cron_day_of_week": "*",
        }
        resp = self.client.post(f"/api/zones/{self.zone.pk}/schedules/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["schedule_type"], "CRON")

    def test_create_time_range_schedule(self):
        scenario = Scenario.objects.create(zone=self.zone, name="S1")
        payload = {
            "scenario": scenario.pk,
            "name": "Weekday watering",
            "schedule_type": "TIME_RANGE",
            "start_time": "06:00",
            "end_time": "06:30",
            "days_of_week": [0, 1, 2, 3, 4],
        }
        resp = self.client.post(f"/api/zones/{self.zone.pk}/schedules/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["schedule_type"], "TIME_RANGE")

    def test_time_range_missing_start_time(self):
        scenario = Scenario.objects.create(zone=self.zone, name="S1")
        payload = {
            "scenario": scenario.pk,
            "name": "Bad schedule",
            "schedule_type": "TIME_RANGE",
            "end_time": "06:30",
        }
        resp = self.client.post(f"/api/zones/{self.zone.pk}/schedules/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_schedules(self):
        scenario = Scenario.objects.create(zone=self.zone, name="S1")
        Schedule.objects.create(scenario=scenario, name="Sched1", schedule_type="CRON")
        Schedule.objects.create(scenario=scenario, name="Sched2", schedule_type="CRON")
        resp = self.client.get(f"/api/zones/{self.zone.pk}/schedules/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_delete_schedule(self):
        scenario = Scenario.objects.create(zone=self.zone, name="S1")
        sched = Schedule.objects.create(scenario=scenario, name="Del", schedule_type="CRON")
        resp = self.client.delete(f"/api/schedules/{sched.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)


class TestExecuteScenarioTask(ScenarioTestBase):
    """Tests for the execute_scenario Celery task."""

    @patch("apps.iot.tasks._execute_scenario_step.apply_async")
    @patch("apps.iot.tasks._execute_reverse_step.apply_async")
    def test_execute_produces_commands(self, mock_reverse, mock_step):
        scenario = Scenario.objects.create(zone=self.zone, name="Exec")
        ScenarioStep.objects.create(
            scenario=scenario, actuator=self.actuator1, order=0, action="ON",
            delay_seconds=0, duration_seconds=None,
        )
        ScenarioStep.objects.create(
            scenario=scenario, actuator=self.actuator2, order=1, action="OFF",
            delay_seconds=0, duration_seconds=None,
        )
        result = execute_scenario_task(scenario.pk, self.user.pk)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["commands_created"], 2)
        # Check Commands were created
        self.assertEqual(Command.objects.filter(created_by=self.user).count(), 2)
        # Scenario status updated
        scenario.refresh_from_db()
        self.assertEqual(scenario.status, Scenario.Status.COMPLETED)

    @patch("apps.iot.tasks._execute_scenario_step.apply_async")
    @patch("apps.iot.tasks._execute_reverse_step.apply_async")
    def test_execute_with_delay_uses_async(self, mock_reverse, mock_step):
        scenario = Scenario.objects.create(zone=self.zone, name="Delayed")
        ScenarioStep.objects.create(
            scenario=scenario, actuator=self.actuator1, order=0, action="ON",
            delay_seconds=30, duration_seconds=120,
        )
        result = execute_scenario_task(scenario.pk, self.user.pk)
        self.assertEqual(result["status"], "completed")
        # Delayed step uses apply_async
        mock_step.assert_called_once()
        # Reverse step scheduled
        mock_reverse.assert_called_once()

    def test_execute_nonexistent_scenario(self):
        result = execute_scenario_task(99999)
        self.assertEqual(result["status"], "not_found")


class TestCheckSchedulesTask(ScenarioTestBase):
    """Tests for the check_schedules periodic task."""

    @patch("apps.iot.tasks.execute_scenario_task.delay")
    def test_cron_schedule_triggers(self, mock_delay):
        from django.utils import timezone as django_tz
        from unittest.mock import PropertyMock

        scenario = Scenario.objects.create(zone=self.zone, name="CronScn")
        now = django_tz.now()
        Schedule.objects.create(
            scenario=scenario,
            name="Match",
            schedule_type="CRON",
            cron_minute=str(now.minute),
            cron_hour=str(now.hour),
            cron_day_of_week="*",
        )
        result = check_schedules_task()
        self.assertEqual(result["triggered"], 1)
        mock_delay.assert_called_once_with(scenario.pk)

    @patch("apps.iot.tasks.execute_scenario_task.delay")
    def test_cron_schedule_no_match(self, mock_delay):
        scenario = Scenario.objects.create(zone=self.zone, name="NoMatch")
        # Set to a minute that won't match current time
        Schedule.objects.create(
            scenario=scenario,
            name="NoMatchSched",
            schedule_type="CRON",
            cron_minute="99",  # impossible minute — never matches
            cron_hour="*",
            cron_day_of_week="*",
        )
        result = check_schedules_task()
        self.assertEqual(result["triggered"], 0)
        mock_delay.assert_not_called()

    @patch("apps.iot.tasks.execute_scenario_task.delay")
    def test_inactive_schedule_skipped(self, mock_delay):
        scenario = Scenario.objects.create(zone=self.zone, name="InactiveScn")
        Schedule.objects.create(
            scenario=scenario,
            name="Inactive",
            schedule_type="CRON",
            cron_minute="*",
            cron_hour="*",
            cron_day_of_week="*",
            is_active=False,
        )
        result = check_schedules_task()
        self.assertEqual(result["triggered"], 0)


class TestCronMatches(TestCase):
    """Tests for the _cron_matches helper."""

    def test_wildcard(self):
        self.assertTrue(_cron_matches("*", 5))

    def test_exact_match(self):
        self.assertTrue(_cron_matches("5", 5))
        self.assertFalse(_cron_matches("5", 6))

    def test_comma_list(self):
        self.assertTrue(_cron_matches("1,3,5", 3))
        self.assertFalse(_cron_matches("1,3,5", 4))

    def test_whitespace(self):
        self.assertTrue(_cron_matches(" * ", 0))
        self.assertTrue(_cron_matches(" 5 , 10 ", 10))
