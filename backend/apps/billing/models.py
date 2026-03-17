"""Billing app models — Subscription."""

from django.db import models

from apps.organizations.models import Organization


class Subscription(models.Model):
    """Tracks a Stripe subscription for an organization."""

    class Status(models.TextChoices):
        TRIALING = "TRIALING", "Trialing"
        ACTIVE = "ACTIVE", "Active"
        PAST_DUE = "PAST_DUE", "Past Due"
        CANCELED = "CANCELED", "Canceled"
        INCOMPLETE = "INCOMPLETE", "Incomplete"

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    stripe_subscription_id = models.CharField(
        max_length=255, unique=True, help_text="Stripe subscription ID"
    )
    stripe_price_id = models.CharField(max_length=255, blank=True)
    plan = models.CharField(max_length=12, choices=Organization.Plan.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.TRIALING)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "api_subscription"

    def __str__(self) -> str:
        return f"{self.organization.name} — {self.plan} ({self.status})"

    @property
    def is_active(self) -> bool:
        """Return True if the subscription is in an active billing state."""
        return self.status in (self.Status.ACTIVE, self.Status.TRIALING)
