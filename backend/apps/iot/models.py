"""IoT app models for the Greenhouse SaaS platform."""

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Greenhouse(models.Model):
    """Represents a physical greenhouse belonging to an organization."""

    organization = models.ForeignKey(
        "api.Organization",
        on_delete=models.CASCADE,
        related_name="greenhouses",
        null=True,
        blank=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="greenhouses",
        help_text="Legacy field — kept for audit. Use organization instead.",
    )
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class Zone(models.Model):
    """Represents a zone within a greenhouse, managed by a LoRa relay node."""

    greenhouse = models.ForeignKey(
        Greenhouse,
        on_delete=models.CASCADE,
        related_name="zones",
    )
    name = models.CharField(max_length=100)
    relay_id = models.PositiveIntegerField(
        unique=True,
        validators=[MinValueValidator(1), MaxValueValidator(255)],
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    transmission_interval = models.PositiveIntegerField(
        default=300,
        help_text="Interval in seconds",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.greenhouse.name} - {self.name}"


class Sensor(models.Model):
    """Represents a sensor attached to a zone."""

    class SensorType(models.TextChoices):
        TEMPERATURE = "TEMP", "Temperature (\u00b0C)"
        HUMIDITY_AIR = "HUM_AIR", "Air Humidity (%)"
        HUMIDITY_SOIL = "HUM_SOIL", "Soil Humidity (%)"
        PH = "PH", "pH Level"
        LIGHT = "LIGHT", "Light (lux)"
        CO2 = "CO2", "CO2 (ppm)"

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="sensors",
    )
    sensor_type = models.CharField(max_length=10, choices=SensorType.choices)
    label = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=20)
    min_threshold = models.FloatField(null=True, blank=True)
    max_threshold = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["zone", "sensor_type"]
        ordering = ["sensor_type"]

    def __str__(self) -> str:
        return f"{self.zone.name} - {self.get_sensor_type_display()}"


class SensorReading(models.Model):
    """Stores individual sensor readings received from relay nodes."""

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="readings",
    )
    value = models.FloatField()
    relay_timestamp = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp from relay if available",
    )
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-received_at"]
        indexes = [
            models.Index(fields=["sensor", "-received_at"]),
            models.Index(fields=["-received_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.sensor}: {self.value} @ {self.received_at}"


class Actuator(models.Model):
    """Represents a controllable actuator in a zone."""

    class ActuatorType(models.TextChoices):
        VALVE = "VALVE", "Water Valve"
        FAN = "FAN", "Ventilation Fan"
        HEATER = "HEATER", "Heater"
        LIGHT = "LIGHT", "Grow Light"
        PUMP = "PUMP", "Water Pump"
        SHADE = "SHADE", "Shade Screen"

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="actuators",
    )
    actuator_type = models.CharField(max_length=10, choices=ActuatorType.choices)
    name = models.CharField(max_length=100)
    gpio_pin = models.PositiveIntegerField(null=True, blank=True)
    state = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({'ON' if self.state else 'OFF'})"


class Command(models.Model):
    """Represents a command sent to an actuator."""

    class CommandType(models.TextChoices):
        ON = "ON", "Turn On"
        OFF = "OFF", "Turn Off"
        SET_VALUE = "SET", "Set Value"

    class CommandStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        ACKNOWLEDGED = "ACK", "Acknowledged"
        FAILED = "FAILED", "Failed"
        TIMEOUT = "TIMEOUT", "Timeout"

    actuator = models.ForeignKey(
        Actuator,
        on_delete=models.CASCADE,
        related_name="commands",
    )
    command_type = models.CharField(max_length=5, choices=CommandType.choices)
    value = models.FloatField(
        null=True,
        blank=True,
        help_text="Value for SET_VALUE commands",
    )
    status = models.CharField(
        max_length=10,
        choices=CommandStatus.choices,
        default=CommandStatus.PENDING,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    automation_rule = models.ForeignKey(
        "AutomationRule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_commands",
        help_text="The automation rule that triggered this command, if any",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.command_type} \u2192 {self.actuator.name} [{self.status}]"


class AutomationRule(models.Model):
    """Defines an automation rule: IF sensor condition THEN actuator action."""

    class Condition(models.TextChoices):
        GREATER_THAN = "GT", "Greater than"
        LESS_THAN = "LT", "Less than"
        EQUAL = "EQ", "Equal to"
        GREATER_EQUAL = "GTE", "Greater or equal"
        LESS_EQUAL = "LTE", "Less or equal"

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="automation_rules",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    sensor_type = models.CharField(
        max_length=10,
        choices=Sensor.SensorType.choices,
    )
    condition = models.CharField(max_length=5, choices=Condition.choices)
    threshold_value = models.FloatField()
    action_actuator = models.ForeignKey(
        Actuator,
        on_delete=models.CASCADE,
        related_name="automation_rules",
    )
    action_command_type = models.CharField(
        max_length=5,
        choices=Command.CommandType.choices,
    )
    action_value = models.FloatField(null=True, blank=True)
    cooldown_seconds = models.PositiveIntegerField(
        default=300,
        help_text="Min seconds between triggers",
    )
    is_active = models.BooleanField(default=True)
    last_triggered = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return (
            f"{self.name}: IF {self.sensor_type} {self.condition} "
            f"{self.threshold_value} THEN {self.action_command_type} "
            f"{self.action_actuator.name}"
        )


class Alert(models.Model):
    """Represents an alert triggered by threshold breaches or system events."""

    class AlertType(models.TextChoices):
        THRESHOLD_HIGH = "HIGH", "Threshold High"
        THRESHOLD_LOW = "LOW", "Threshold Low"
        RELAY_OFFLINE = "OFFLINE", "Relay Offline"
        SENSOR_ERROR = "ERROR", "Sensor Error"
        COMMAND_FAILED = "CMD_FAIL", "Command Failed"

    class Severity(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="alerts",
        null=True,
        blank=True,
    )
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="alerts",
    )
    alert_type = models.CharField(max_length=10, choices=AlertType.choices)
    severity = models.CharField(
        max_length=10,
        choices=Severity.choices,
        default=Severity.WARNING,
    )
    value = models.FloatField(null=True, blank=True)
    message = models.TextField()
    is_acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.severity}] {self.message}"


class NotificationChannel(models.Model):
    """A notification delivery channel configured per organization."""

    class ChannelType(models.TextChoices):
        EMAIL = "EMAIL", "Email"
        WEBHOOK = "WEBHOOK", "Webhook"
        TELEGRAM = "TELEGRAM", "Telegram"
        PUSH = "PUSH", "Web Push"

    organization = models.ForeignKey(
        "api.Organization",
        on_delete=models.CASCADE,
        related_name="notification_channels",
    )
    channel_type = models.CharField(max_length=10, choices=ChannelType.choices)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    # EMAIL: comma-separated recipient addresses
    email_recipients = models.TextField(
        blank=True,
        help_text="Comma-separated email addresses (for EMAIL channel)",
    )

    # WEBHOOK: target URL and optional secret for HMAC signing
    webhook_url = models.URLField(
        blank=True,
        help_text="Target URL (for WEBHOOK channel)",
    )
    webhook_secret = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional secret for HMAC-SHA256 signature header (for WEBHOOK channel)",
    )

    # TELEGRAM: bot token and chat ID
    telegram_bot_token = models.CharField(
        max_length=255,
        blank=True,
        help_text="Telegram Bot API token (for TELEGRAM channel)",
    )
    telegram_chat_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Telegram chat/group ID (for TELEGRAM channel)",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_channel_type_display()})"


class NotificationRule(models.Model):
    """Maps alert conditions to notification channels."""

    organization = models.ForeignKey(
        "api.Organization",
        on_delete=models.CASCADE,
        related_name="notification_rules",
    )
    name = models.CharField(max_length=100)
    channel = models.ForeignKey(
        NotificationChannel,
        on_delete=models.CASCADE,
        related_name="rules",
    )
    alert_types = models.JSONField(
        default=list,
        blank=True,
        help_text="List of alert types to match, e.g. ['HIGH','LOW','OFFLINE']. Empty = all.",
    )
    severities = models.JSONField(
        default=list,
        blank=True,
        help_text="List of severities to match, e.g. ['WARNING','CRITICAL']. Empty = all.",
    )
    is_active = models.BooleanField(default=True)
    cooldown_seconds = models.PositiveIntegerField(
        default=300,
        help_text="Min seconds between notifications for the same rule",
    )
    last_notified = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} → {self.channel.name}"


class NotificationLog(models.Model):
    """Audit trail of sent notifications."""

    class Status(models.TextChoices):
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    rule = models.ForeignKey(
        NotificationRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    channel = models.ForeignKey(
        NotificationChannel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logs",
    )
    alert = models.ForeignKey(
        Alert,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_logs",
    )
    status = models.CharField(max_length=10, choices=Status.choices)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.status} via {self.channel} @ {self.created_at}"


class PushSubscription(models.Model):
    """Web Push subscription stored per user for push notification delivery."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200, help_text="Client public encryption key")
    auth = models.CharField(max_length=100, help_text="Client auth secret")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"PushSub({self.user.username}@{self.endpoint[:40]}...)"


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

    def __str__(self) -> str:
        return f"{self.name} → {self.scenario.name}"


class SensorReadingHourly(models.Model):
    """Pre-aggregated hourly sensor readings for fast analytics queries."""

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="hourly_readings",
    )
    hour = models.DateTimeField(help_text="Start of the hour bucket")
    avg_value = models.FloatField()
    min_value = models.FloatField()
    max_value = models.FloatField()
    stddev_value = models.FloatField(default=0.0)
    count = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["sensor", "hour"]
        ordering = ["-hour"]
        indexes = [
            models.Index(fields=["sensor", "-hour"]),
        ]

    def __str__(self) -> str:
        return f"{self.sensor} @ {self.hour}: avg={self.avg_value:.2f} ({self.count} readings)"


class AuditEvent(models.Model):
    """Records who did what, when, and on which resource for audit trail."""

    class Action(models.TextChoices):
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"
        LOGIN = "LOGIN", "Login"
        LOGOUT = "LOGOUT", "Logout"
        COMMAND = "COMMAND", "Command Sent"
        EXPORT = "EXPORT", "Data Export"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=10, choices=Action.choices)
    resource_type = models.CharField(
        max_length=50,
        help_text="Model name or resource type (e.g. 'Greenhouse', 'Zone', 'Command')",
    )
    resource_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Primary key of the affected resource",
    )
    description = models.TextField(
        blank=True,
        help_text="Human-readable description of the action",
    )
    changes = models.JSONField(
        default=dict,
        blank=True,
        help_text="JSON diff of changed fields (old_value → new_value)",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self) -> str:
        username = self.user.username if self.user else "system"
        return f"[{self.action}] {username} → {self.resource_type}#{self.resource_id} @ {self.created_at}"


class TemplateCategory(models.Model):
    """Category for marketplace templates (e.g. vegetables, flowers, hydroponics)."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True, help_text="Icon identifier for the frontend")
    order = models.PositiveIntegerField(default=0, help_text="Display order in category list")

    class Meta:
        ordering = ["order", "name"]
        verbose_name_plural = "template categories"

    def __str__(self) -> str:
        return self.name


class Template(models.Model):
    """A reusable zone configuration template for the marketplace."""

    organization = models.ForeignKey(
        "api.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="templates",
        help_text="Organization that published this template",
    )
    category = models.ForeignKey(
        TemplateCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="templates",
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_official = models.BooleanField(
        default=False,
        help_text="Marked as official Greenhouse template",
    )
    is_published = models.BooleanField(
        default=True,
        help_text="Visible on the marketplace",
    )
    version = models.CharField(max_length=20, default="1.0.0")
    changelog = models.TextField(blank=True, help_text="Version changelog")
    config = models.JSONField(
        default=dict,
        help_text="Snapshot of zone configuration: sensors, actuators, automation_rules, scenarios",
    )
    avg_rating = models.FloatField(default=0.0)
    rating_count = models.PositiveIntegerField(default=0)
    clone_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-clone_count", "-avg_rating", "-created_at"]
        indexes = [
            models.Index(fields=["-avg_rating", "-clone_count"]),
            models.Index(fields=["category", "-avg_rating"]),
        ]

    def __str__(self) -> str:
        official = " [Official]" if self.is_official else ""
        return f"{self.name} v{self.version}{official}"


class TemplateRating(models.Model):
    """A user rating for a marketplace template."""

    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name="ratings",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="template_ratings",
    )
    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["template", "user"]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.username} → {self.template.name}: {self.score}/5"


class MLModel(models.Model):
    """Stores trained ML model metadata and serialized model data per sensor."""

    class ModelType(models.TextChoices):
        ISOLATION_FOREST = "IF", "Isolation Forest"
        LINEAR_REGRESSION = "LR", "Linear Regression"

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="ml_models",
    )
    model_type = models.CharField(max_length=5, choices=ModelType.choices)
    model_data = models.BinaryField(
        help_text="Pickled scikit-learn model",
    )
    training_samples = models.PositiveIntegerField(default=0)
    mean_absolute_error = models.FloatField(null=True, blank=True)
    last_trained_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["sensor", "model_type"]
        ordering = ["-last_trained_at"]

    def __str__(self) -> str:
        return f"{self.get_model_type_display()} for {self.sensor}"


class SensorPrediction(models.Model):
    """Stores predicted sensor values for the next 6 hours."""

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="predictions",
    )
    predicted_at = models.DateTimeField(
        help_text="The future timestamp this prediction is for",
    )
    predicted_value = models.FloatField()
    confidence_lower = models.FloatField(
        help_text="Lower bound of 95% confidence interval",
    )
    confidence_upper = models.FloatField(
        help_text="Upper bound of 95% confidence interval",
    )
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["predicted_at"]
        indexes = [
            models.Index(fields=["sensor", "predicted_at"]),
            models.Index(fields=["sensor", "-generated_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.sensor}: {self.predicted_value:.2f} @ {self.predicted_at}"


class AnomalyRecord(models.Model):
    """Records anomalies detected by ML models."""

    class DetectionMethod(models.TextChoices):
        Z_SCORE = "ZSCORE", "Z-Score"
        ISOLATION_FOREST = "IF", "Isolation Forest"

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="anomalies",
    )
    reading = models.ForeignKey(
        SensorReading,
        on_delete=models.CASCADE,
        related_name="anomalies",
    )
    detection_method = models.CharField(
        max_length=10,
        choices=DetectionMethod.choices,
    )
    anomaly_score = models.FloatField(
        help_text="Anomaly score (higher = more anomalous)",
    )
    value = models.FloatField()
    explanation = models.TextField(blank=True)
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-detected_at"]
        indexes = [
            models.Index(fields=["sensor", "-detected_at"]),
        ]

    def __str__(self) -> str:
        return f"Anomaly on {self.sensor}: score={self.anomaly_score:.2f}"


class SmartSuggestion(models.Model):
    """AI-generated threshold adjustment suggestions."""

    class SuggestionType(models.TextChoices):
        THRESHOLD_ADJUST = "THRESH", "Threshold Adjustment"
        TREND_WARNING = "TREND", "Trend Warning"

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="suggestions",
    )
    suggestion_type = models.CharField(
        max_length=10,
        choices=SuggestionType.choices,
    )
    message = models.TextField()
    suggested_min = models.FloatField(null=True, blank=True)
    suggested_max = models.FloatField(null=True, blank=True)
    confidence = models.FloatField(
        help_text="Confidence score (0-1)",
        default=0.0,
    )
    is_applied = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Suggestion for {self.sensor}: {self.message[:50]}"


class SensorReadingDaily(models.Model):
    """Pre-aggregated daily sensor readings for long-term analytics."""

    sensor = models.ForeignKey(
        Sensor,
        on_delete=models.CASCADE,
        related_name="daily_readings",
    )
    date = models.DateField(help_text="The calendar date for this bucket")
    avg_value = models.FloatField()
    min_value = models.FloatField()
    max_value = models.FloatField()
    stddev_value = models.FloatField(default=0.0)
    count = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["sensor", "date"]
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["sensor", "-date"]),
        ]

    def __str__(self) -> str:
        return f"{self.sensor} @ {self.date}: avg={self.avg_value:.2f} ({self.count} readings)"


class RetentionPolicy(models.Model):
    """Configurable data retention policy per organization."""

    organization = models.OneToOneField(
        "api.Organization",
        on_delete=models.CASCADE,
        related_name="retention_policy",
    )
    raw_retention_days = models.PositiveIntegerField(
        default=30,
        help_text="Days to keep raw SensorReading data (0 = forever)",
    )
    hourly_retention_days = models.PositiveIntegerField(
        default=365,
        help_text="Days to keep hourly aggregated data (0 = forever)",
    )
    daily_retention_days = models.PositiveIntegerField(
        default=0,
        help_text="Days to keep daily aggregated data (0 = forever)",
    )
    archive_to_cold_storage = models.BooleanField(
        default=False,
        help_text="Whether to archive data to S3/MinIO before deletion",
    )
    cold_storage_bucket = models.CharField(
        max_length=255,
        blank=True,
        help_text="S3/MinIO bucket name for cold storage archival",
    )
    cold_storage_prefix = models.CharField(
        max_length=255,
        blank=True,
        default="greenhouse-archive/",
        help_text="Key prefix within the bucket",
    )
    last_cleanup_at = models.DateTimeField(null=True, blank=True)
    last_archive_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "retention policies"

    def __str__(self) -> str:
        return f"RetentionPolicy({self.organization.name}: raw={self.raw_retention_days}d, hourly={self.hourly_retention_days}d)"


class DataArchiveLog(models.Model):
    """Audit trail for data archival operations."""

    class ArchiveType(models.TextChoices):
        RAW_READINGS = "RAW", "Raw Readings"
        HOURLY_READINGS = "HOURLY", "Hourly Readings"

    class Status(models.TextChoices):
        STARTED = "STARTED", "Started"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"

    organization = models.ForeignKey(
        "api.Organization",
        on_delete=models.CASCADE,
        related_name="archive_logs",
    )
    archive_type = models.CharField(max_length=10, choices=ArchiveType.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.STARTED)
    records_archived = models.PositiveIntegerField(default=0)
    records_deleted = models.PositiveIntegerField(default=0)
    date_range_start = models.DateTimeField(help_text="Start of archived date range")
    date_range_end = models.DateTimeField(help_text="End of archived date range")
    storage_path = models.CharField(
        max_length=500,
        blank=True,
        help_text="S3/MinIO path where data was archived",
    )
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"Archive({self.archive_type} {self.status} @ {self.started_at})"
