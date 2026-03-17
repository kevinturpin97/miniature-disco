"""Schedules app models — Scenario, ScenarioStep, Schedule."""

from django.db import models

from apps.greenhouse.models import Actuator, Command, Zone


class Scenario(models.Model):
    """A named sequence of actions that can be triggered manually or on schedule."""

    class Status(models.TextChoices):
        IDLE = "IDLE", "Idle"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="scenarios",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.IDLE,
    )
    is_active = models.BooleanField(default=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        db_table = "iot_scenario"

    def __str__(self) -> str:
        return f"{self.name} ({self.zone.name})"


class ScenarioStep(models.Model):
    """A single step within a scenario — controls one actuator."""

    scenario = models.ForeignKey(
        Scenario,
        on_delete=models.CASCADE,
        related_name="steps",
    )
    actuator = models.ForeignKey(
        Actuator,
        on_delete=models.CASCADE,
        related_name="scenario_steps",
    )
    order = models.PositiveIntegerField(
        help_text="Execution order within the scenario (0-based)",
    )
    action = models.CharField(
        max_length=5,
        choices=Command.CommandType.choices,
    )
    action_value = models.FloatField(
        null=True,
        blank=True,
        help_text="Value for SET commands",
    )
    delay_seconds = models.PositiveIntegerField(
        default=0,
        help_text="Seconds to wait before executing this step",
    )
    duration_seconds = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="If set, send the reverse action after this many seconds",
    )

    class Meta:
        ordering = ["order"]
        unique_together = ["scenario", "order"]
        db_table = "iot_scenariostep"

    def __str__(self) -> str:
        return f"Step {self.order}: {self.action} → {self.actuator.name}"


class Schedule(models.Model):
    """A time-based schedule that triggers a scenario."""

    class ScheduleType(models.TextChoices):
        CRON = "CRON", "Cron Expression"
        TIME_RANGE = "TIME_RANGE", "Daily Time Range"

    class DayOfWeek(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    scenario = models.ForeignKey(
        Scenario,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    name = models.CharField(max_length=100)
    schedule_type = models.CharField(
        max_length=12,
        choices=ScheduleType.choices,
    )

    # CRON fields
    cron_minute = models.CharField(max_length=20, default="0", help_text="Cron minute field")
    cron_hour = models.CharField(max_length=20, default="*", help_text="Cron hour field")
    cron_day_of_week = models.CharField(
        max_length=20,
        default="*",
        help_text="Cron day-of-week (0=Mon..6=Sun) or *",
    )

    # TIME_RANGE fields
    start_time = models.TimeField(null=True, blank=True, help_text="Start time for TIME_RANGE")
    end_time = models.TimeField(null=True, blank=True, help_text="End time for TIME_RANGE")
    days_of_week = models.JSONField(
        default=list,
        blank=True,
        help_text="List of day-of-week integers (0=Mon..6=Sun) for TIME_RANGE",
    )

    is_active = models.BooleanField(default=True)
    next_run_at = models.DateTimeField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        db_table = "iot_schedule"

    def __str__(self) -> str:
        return f"{self.name} → {self.scenario.name}"
