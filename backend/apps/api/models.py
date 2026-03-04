"""API app models — Organization, Membership, and Invitation."""

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


class Organization(models.Model):
    """Represents a team or company that owns greenhouses."""

    class Plan(models.TextChoices):
        FREE = "FREE", "Free"
        PRO = "PRO", "Pro"
        ENTERPRISE = "ENTERPRISE", "Enterprise"

    PLAN_LIMITS: dict[str, dict[str, int]] = {
        Plan.FREE: {"max_greenhouses": 3, "max_zones": 9},
        Plan.PRO: {"max_greenhouses": 10, "max_zones": 50},
        Plan.ENTERPRISE: {"max_greenhouses": 0, "max_zones": 0},  # 0 = unlimited
    }

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True)
    plan = models.CharField(max_length=12, choices=Plan.choices, default=Plan.FREE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @property
    def max_greenhouses(self) -> int:
        """Return the greenhouse limit for the current plan (0 = unlimited)."""
        return self.PLAN_LIMITS.get(self.plan, {}).get("max_greenhouses", 3)

    @property
    def max_zones(self) -> int:
        """Return the zone limit for the current plan (0 = unlimited)."""
        return self.PLAN_LIMITS.get(self.plan, {}).get("max_zones", 9)


class Membership(models.Model):
    """Links a user to an organization with a specific role."""

    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner"
        ADMIN = "ADMIN", "Admin"
        OPERATOR = "OPERATOR", "Operator"
        VIEWER = "VIEWER", "Viewer"

    ROLE_HIERARCHY: dict[str, int] = {
        Role.VIEWER: 0,
        Role.OPERATOR: 1,
        Role.ADMIN: 2,
        Role.OWNER: 3,
    }

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.VIEWER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["user", "organization"]
        ordering = ["role", "joined_at"]

    def __str__(self) -> str:
        return f"{self.user.username} — {self.organization.name} ({self.role})"

    @property
    def role_level(self) -> int:
        """Return the numeric level of this role for comparison."""
        return self.ROLE_HIERARCHY.get(self.role, 0)


def _generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


class Invitation(models.Model):
    """Represents a pending invitation to join an organization."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=10,
        choices=Membership.Role.choices,
        default=Membership.Role.VIEWER,
    )
    token = models.CharField(max_length=64, unique=True, default=_generate_invite_token)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    accepted = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Invite {self.email} → {self.organization.name} ({self.role})"

    @property
    def is_expired(self) -> bool:
        """Return True if the invitation has expired."""
        return timezone.now() > self.expires_at

    @property
    def is_valid(self) -> bool:
        """Return True if the invitation can still be accepted."""
        return not self.accepted and not self.is_expired
