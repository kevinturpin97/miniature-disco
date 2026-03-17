"""Compliance app models — CropCycle, Note, CultureLog, TraceabilityReport."""

from django.conf import settings
from django.db import models

from apps.greenhouse.models import Zone


class CropCycle(models.Model):
    """Represents a crop cycle (growing season) for a zone."""

    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        ACTIVE = "ACTIVE", "Active"
        HARVESTED = "HARVESTED", "Harvested"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="crop_cycles",
    )
    species = models.CharField(max_length=150, help_text="Plant species (e.g. Solanum lycopersicum)")
    variety = models.CharField(max_length=150, blank=True, help_text="Cultivar or variety name")
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PLANNED,
    )
    sowing_date = models.DateField(null=True, blank=True)
    transplant_date = models.DateField(null=True, blank=True)
    harvest_start_date = models.DateField(null=True, blank=True)
    harvest_end_date = models.DateField(null=True, blank=True)
    expected_yield = models.CharField(max_length=100, blank=True, help_text="Expected yield (e.g. 5kg/m2)")
    actual_yield = models.CharField(max_length=100, blank=True, help_text="Actual yield recorded")
    notes = models.TextField(blank=True, help_text="General notes about this crop cycle")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crop_cycles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["zone", "-created_at"]),
            models.Index(fields=["status"]),
        ]
        db_table = "iot_cropcycle"

    def __str__(self) -> str:
        variety_str = f" ({self.variety})" if self.variety else ""
        return f"{self.species}{variety_str} @ {self.zone.name} [{self.status}]"


class Note(models.Model):
    """A manual annotation by a user on a zone at a specific point in time."""

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    crop_cycle = models.ForeignKey(
        CropCycle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zone_notes",
        help_text="Optional link to an active crop cycle",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zone_notes",
    )
    content = models.TextField(help_text="Observation or field note")
    observed_at = models.DateTimeField(
        help_text="When the observation was made (can differ from created_at)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-observed_at"]
        indexes = [
            models.Index(fields=["zone", "-observed_at"]),
        ]
        db_table = "iot_note"

    def __str__(self) -> str:
        author_name = self.author.username if self.author else "anonymous"
        return f"Note by {author_name} on {self.zone.name} @ {self.observed_at}"


class CultureLog(models.Model):
    """Automatic journal of all interventions on a zone for traceability.

    Entries are created automatically by signals when commands, alerts,
    threshold changes, or notes are created.
    """

    class EntryType(models.TextChoices):
        COMMAND = "COMMAND", "Command Sent"
        ALERT = "ALERT", "Alert Triggered"
        NOTE = "NOTE", "Manual Note"
        THRESHOLD_CHANGE = "THRESHOLD", "Threshold Changed"
        CROP_CYCLE = "CROP", "Crop Cycle Event"
        AUTOMATION = "AUTOMATION", "Automation Triggered"

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="culture_logs",
    )
    crop_cycle = models.ForeignKey(
        CropCycle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="culture_logs",
    )
    entry_type = models.CharField(max_length=10, choices=EntryType.choices)
    summary = models.TextField(help_text="Human-readable summary of the event")
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Structured data about the event (command details, alert info, etc.)",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="User who triggered the action, if applicable",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["zone", "-created_at"]),
            models.Index(fields=["entry_type", "-created_at"]),
            models.Index(fields=["crop_cycle", "-created_at"]),
        ]
        db_table = "iot_culturelog"

    def __str__(self) -> str:
        return f"[{self.entry_type}] {self.summary[:60]} @ {self.created_at}"


class TraceabilityReport(models.Model):
    """Stores generated traceability reports with SHA256 digital signature."""

    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name="traceability_reports",
    )
    crop_cycle = models.ForeignKey(
        CropCycle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="traceability_reports",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    pdf_file = models.BinaryField(help_text="Generated PDF binary content")
    sha256_hash = models.CharField(
        max_length=64,
        help_text="SHA256 hash of the PDF content for integrity verification",
    )
    signed_at = models.DateTimeField(
        help_text="Timestamp when the hash was computed",
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "iot_traceabilityreport"

    def __str__(self) -> str:
        return f"Report {self.zone.name} ({self.period_start} → {self.period_end})"
