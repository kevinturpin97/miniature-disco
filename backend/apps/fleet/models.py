"""Fleet app models — EdgeDevice, SyncBatch, FirmwareRelease, DeviceOTAJob, DeviceMetrics."""

import uuid

from django.db import models

from apps.organizations.models import Organization


class EdgeDevice(models.Model):
    """Represents a Raspberry Pi edge device registered to an organization.

    Each edge device authenticates with a long-lived HMAC-SHA256 secret key
    and periodically syncs data to the cloud API.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="edge_devices",
    )
    device_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True,
        help_text="Auto-generated UUID, stable identifier for this device",
    )
    name = models.CharField(max_length=150, help_text="Human-friendly device name (e.g. 'Raspberry Pi Site Nord')")
    secret_key = models.CharField(
        max_length=64,
        help_text="HMAC-SHA256 signing key — never expose in API responses",
    )
    firmware_version = models.CharField(
        max_length=50,
        blank=True,
        help_text="Firmware version string reported by the device",
    )
    last_sync_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last successful sync",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        db_table = "iot_edgedevice"

    def __str__(self) -> str:
        return f"{self.name} ({self.device_id})"


class SyncBatch(models.Model):
    """Records each sync batch sent from an edge device to the cloud."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"
        RETRY = "RETRY", "Retrying"

    edge_device = models.ForeignKey(
        EdgeDevice,
        on_delete=models.CASCADE,
        related_name="sync_batches",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    records_count = models.PositiveIntegerField(default=0, help_text="Number of records in the batch")
    payload_size_kb = models.FloatField(default=0.0, help_text="Compressed payload size in KB")
    retry_count = models.PositiveIntegerField(default=0, help_text="Number of retry attempts")
    next_retry_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Scheduled time for next retry attempt",
    )
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["edge_device", "-started_at"]),
            models.Index(fields=["status", "next_retry_at"]),
        ]
        db_table = "iot_syncbatch"

    def __str__(self) -> str:
        return f"SyncBatch({self.edge_device.name} {self.status} {self.records_count} records @ {self.started_at})"


class FirmwareRelease(models.Model):
    """A published firmware binary that can be deployed to edge devices via OTA."""

    class Channel(models.TextChoices):
        STABLE = "STABLE", "Stable"
        BETA = "BETA", "Beta"
        NIGHTLY = "NIGHTLY", "Nightly"

    version = models.CharField(
        max_length=30,
        unique=True,
        help_text="Semantic version string (e.g., 3.2.1)",
    )
    channel = models.CharField(
        max_length=10,
        choices=Channel.choices,
        default=Channel.STABLE,
    )
    release_notes = models.TextField(blank=True)
    binary_url = models.URLField(max_length=500, help_text="URL to the firmware binary")
    checksum_sha256 = models.CharField(
        max_length=64,
        help_text="SHA-256 hex digest of the binary",
    )
    file_size_bytes = models.PositiveIntegerField(help_text="Binary size in bytes")
    min_hardware_version = models.CharField(
        max_length=30,
        blank=True,
        help_text="Minimum hardware version required (optional)",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "iot_firmwarerelease"

    def __str__(self) -> str:
        return f"Firmware {self.version} ({self.channel})"


class DeviceOTAJob(models.Model):
    """Tracks the lifecycle of an over-the-air firmware update for one device."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DOWNLOADING = "DOWNLOADING", "Downloading"
        INSTALLING = "INSTALLING", "Installing"
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"
        ROLLED_BACK = "ROLLED_BACK", "Rolled Back"

    edge_device = models.ForeignKey(
        EdgeDevice,
        on_delete=models.CASCADE,
        related_name="ota_jobs",
    )
    firmware_release = models.ForeignKey(
        FirmwareRelease,
        on_delete=models.CASCADE,
        related_name="ota_jobs",
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PENDING,
    )
    progress_percent = models.PositiveIntegerField(
        default=0,
        help_text="Download/install progress (0–100)",
    )
    previous_version = models.CharField(
        max_length=30,
        blank=True,
        help_text="Firmware version before this update",
    )
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "iot_deviceotajob"

    def __str__(self) -> str:
        return (
            f"OTA {self.edge_device.name}: "
            f"{self.previous_version} → {self.firmware_release.version} "
            f"[{self.status}]"
        )


class DeviceMetrics(models.Model):
    """Point-in-time resource metrics reported by an edge device."""

    edge_device = models.ForeignKey(
        EdgeDevice,
        on_delete=models.CASCADE,
        related_name="metrics",
    )
    cpu_percent = models.FloatField(help_text="CPU usage 0–100")
    memory_percent = models.FloatField(help_text="RAM usage 0–100")
    disk_percent = models.FloatField(help_text="Disk usage 0–100")
    cpu_temperature = models.FloatField(
        null=True,
        blank=True,
        help_text="CPU temperature in °C",
    )
    uptime_seconds = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Device uptime in seconds",
    )
    network_latency_ms = models.FloatField(
        null=True,
        blank=True,
        help_text="Network latency to cloud in ms",
    )
    recorded_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["edge_device", "-recorded_at"]),
        ]
        verbose_name = "Device Metrics"
        verbose_name_plural = "Device Metrics"
        db_table = "iot_devicemetrics"

    def __str__(self) -> str:
        return (
            f"{self.edge_device.name} @ {self.recorded_at}: "
            f"CPU {self.cpu_percent}% MEM {self.memory_percent}% "
            f"DISK {self.disk_percent}%"
        )
