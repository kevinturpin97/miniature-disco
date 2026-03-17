"""Crop app models — CropStatus, CropIndicatorPreference."""

from django.conf import settings
from django.db import models

from apps.greenhouse.models import Zone


class CropStatus(models.Model):
    """Computed plant health indicators for a zone, refreshed every 15 minutes.

    All indicator values are stored as short string codes so the engine can
    be swapped without a schema migration.  Numeric values (scores, predictions)
    are stored as floats to allow precise display.
    """

    class GrowthStatus(models.TextChoices):
        SLOW = "SLOW", "Slow"
        NORMAL = "NORMAL", "Normal"
        FAST = "FAST", "Fast"
        UNKNOWN = "UNKNOWN", "Unknown"

    class HydrationStatus(models.TextChoices):
        DRY = "DRY", "Dry"
        CORRECT = "CORRECT", "Correct"
        OPTIMAL = "OPTIMAL", "Optimal"
        EXCESS = "EXCESS", "Excess"
        UNKNOWN = "UNKNOWN", "Unknown"

    class StressLevel(models.TextChoices):
        NONE = "NONE", "None"
        LIGHT = "LIGHT", "Light"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"
        UNKNOWN = "UNKNOWN", "Unknown"

    class RiskLevel(models.TextChoices):
        LOW = "LOW", "Low"
        MODERATE = "MODERATE", "Moderate"
        HIGH = "HIGH", "High"
        UNKNOWN = "UNKNOWN", "Unknown"

    class LightLevel(models.TextChoices):
        INSUFFICIENT = "INSUFFICIENT", "Insufficient"
        CORRECT = "CORRECT", "Correct"
        OPTIMAL = "OPTIMAL", "Optimal"
        UNKNOWN = "UNKNOWN", "Unknown"

    zone = models.OneToOneField(
        Zone,
        on_delete=models.CASCADE,
        related_name="crop_status",
    )
    # -- Growth --
    growth_status = models.CharField(
        max_length=10,
        choices=GrowthStatus.choices,
        default=GrowthStatus.UNKNOWN,
    )
    gdd_accumulated = models.FloatField(null=True, blank=True, help_text="Growing Degree Days accumulated")
    # -- Hydration --
    hydration_status = models.CharField(
        max_length=10,
        choices=HydrationStatus.choices,
        default=HydrationStatus.UNKNOWN,
    )
    evapotranspiration = models.FloatField(null=True, blank=True, help_text="ET₀ mm/day estimate")
    # -- Heat stress --
    heat_stress = models.CharField(
        max_length=10,
        choices=StressLevel.choices,
        default=StressLevel.UNKNOWN,
    )
    heat_index = models.FloatField(null=True, blank=True, help_text="Calculated heat index (°C)")
    # -- Yield & health --
    yield_prediction = models.FloatField(null=True, blank=True, help_text="Yield prediction score (%)")
    plant_health_score = models.FloatField(null=True, blank=True, help_text="Overall plant health (0-100)")
    # -- Disease risk --
    disease_risk = models.CharField(
        max_length=10,
        choices=RiskLevel.choices,
        default=RiskLevel.UNKNOWN,
    )
    # -- Climate stress --
    climate_stress = models.CharField(
        max_length=10,
        choices=StressLevel.choices,
        default=StressLevel.UNKNOWN,
    )
    # -- Light --
    light_level = models.CharField(
        max_length=15,
        choices=LightLevel.choices,
        default=LightLevel.UNKNOWN,
    )
    # -- Harvest & irrigation --
    harvest_eta_days = models.IntegerField(null=True, blank=True, help_text="Estimated days until harvest")
    irrigation_needed_liters = models.FloatField(
        null=True, blank=True, help_text="Recommended irrigation (L/plant)"
    )
    calculated_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        verbose_name = "Crop Status"
        verbose_name_plural = "Crop Statuses"
        db_table = "iot_cropstatus"

    def __str__(self) -> str:
        return f"CropStatus({self.zone.name} @ {self.calculated_at})"


class CropIndicatorPreference(models.Model):
    """Per-user opt-in/opt-out for each crop intelligence indicator.

    If no preference row exists for a (user, indicator) pair the indicator is
    considered *enabled* by default.
    """

    class Indicator(models.TextChoices):
        GROWTH = "GROWTH", "Growth"
        HYDRATION = "HYDRATION", "Hydration"
        HEAT_STRESS = "HEAT_STRESS", "Heat Stress"
        YIELD = "YIELD", "Yield Prediction"
        PLANT_HEALTH = "PLANT_HEALTH", "Plant Health"
        DISEASE_RISK = "DISEASE_RISK", "Disease Risk"
        CLIMATE_STRESS = "CLIMATE_STRESS", "Climate Stress"
        LIGHT = "LIGHT", "Light Availability"
        HARVEST_ETA = "HARVEST_ETA", "Harvest ETA"
        IRRIGATION = "IRRIGATION", "Irrigation Need"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="crop_indicator_preferences",
    )
    indicator = models.CharField(max_length=20, choices=Indicator.choices)
    enabled = models.BooleanField(default=True)

    class Meta:
        unique_together = ["user", "indicator"]
        ordering = ["indicator"]
        db_table = "iot_cropindicatorpreference"

    def __str__(self) -> str:
        state = "ON" if self.enabled else "OFF"
        return f"{self.user} — {self.indicator} [{state}]"
