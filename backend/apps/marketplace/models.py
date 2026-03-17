"""Marketplace app models — TemplateCategory, Template, TemplateRating."""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.organizations.models import Organization


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
        db_table = "iot_templatecategory"

    def __str__(self) -> str:
        return self.name


class Template(models.Model):
    """A reusable zone configuration template for the marketplace."""

    organization = models.ForeignKey(
        Organization,
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
        db_table = "iot_template"

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
        db_table = "iot_templaterating"

    def __str__(self) -> str:
        return f"{self.user.username} → {self.template.name}: {self.score}/5"
