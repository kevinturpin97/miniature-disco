"""Analytics app models — SensorReadingHourly, SensorReadingDaily, RetentionPolicy, DataArchiveLog, AuditEvent, MLModel, SensorPrediction, AnomalyRecord, SmartSuggestion."""

from django.conf import settings
from django.db import models

from apps.greenhouse.models import Sensor, SensorReading
from apps.organizations.models import Organization


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
        db_table = "iot_sensorreadinghourly"

    def __str__(self) -> str:
        return f"{self.sensor} @ {self.hour}: avg={self.avg_value:.2f} ({self.count} readings)"


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
        db_table = "iot_sensorreadingdaily"

    def __str__(self) -> str:
        return f"{self.sensor} @ {self.date}: avg={self.avg_value:.2f} ({self.count} readings)"


class RetentionPolicy(models.Model):
    """Configurable data retention policy per organization."""

    organization = models.OneToOneField(
        Organization,
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
        db_table = "iot_retentionpolicy"

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
        Organization,
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
        db_table = "iot_dataarchivelog"

    def __str__(self) -> str:
        return f"Archive({self.archive_type} {self.status} @ {self.started_at})"


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
    cloud_synced = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether this record has been synced to the cloud",
    )
    cloud_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when this record was successfully synced to the cloud",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["cloud_synced", "-created_at"]),
        ]
        db_table = "iot_auditevent"

    def __str__(self) -> str:
        username = self.user.username if self.user else "system"
        return f"[{self.action}] {username} → {self.resource_type}#{self.resource_id} @ {self.created_at}"


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
        db_table = "iot_mlmodel"

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
        db_table = "iot_sensorprediction"

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
        db_table = "iot_anomalyrecord"

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
        db_table = "iot_smartsuggestion"

    def __str__(self) -> str:
        return f"Suggestion for {self.sensor}: {self.message[:50]}"
