"""IoT app models for the Greenhouse SaaS platform."""

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
