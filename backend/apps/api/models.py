"""API app models — Organization, Membership, Invitation, APIKey, and Webhook."""

import hashlib
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


def _generate_api_key() -> str:
    """Generate a random API key prefixed with 'gh_'."""
    return f"gh_{secrets.token_hex(32)}"


class APIKey(models.Model):
    """Long-lived API key for programmatic access to the platform."""

    class Scope(models.TextChoices):
        READ = "READ", "Read"
        WRITE = "WRITE", "Write"
        ADMIN = "ADMIN", "Admin"

    SCOPE_HIERARCHY: dict[str, int] = {
        Scope.READ: 0,
        Scope.WRITE: 1,
        Scope.ADMIN: 2,
    }

    # Rate limits per plan (requests per minute)
    PLAN_RATE_LIMITS: dict[str, int] = {
        Organization.Plan.FREE: 60,
        Organization.Plan.PRO: 300,
        Organization.Plan.ENTERPRISE: 1000,
    }

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    name = models.CharField(max_length=100, help_text="Human-readable label for this key")
    prefix = models.CharField(
        max_length=12,
        db_index=True,
        help_text="First 12 chars of the key for identification",
    )
    hashed_key = models.CharField(
        max_length=128,
        unique=True,
        help_text="SHA-256 hash of the full API key",
    )
    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.READ)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Optional expiry date")
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_api_keys",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "API Key"
        verbose_name_plural = "API Keys"

    def __str__(self) -> str:
        return f"{self.name} ({self.prefix}...)"

    @property
    def is_expired(self) -> bool:
        """Return True if the key has expired."""
        if self.expires_at is None:
            return False
        return timezone.now() > self.expires_at

    @property
    def is_usable(self) -> bool:
        """Return True if the key is active and not expired."""
        return self.is_active and not self.is_expired

    @property
    def scope_level(self) -> int:
        """Return the numeric level of this scope for comparison."""
        return self.SCOPE_HIERARCHY.get(self.scope, 0)

    @property
    def rate_limit(self) -> int:
        """Return the rate limit (requests/min) based on the org plan."""
        return self.PLAN_RATE_LIMITS.get(self.organization.plan, 60)

    @staticmethod
    def hash_key(raw_key: str) -> str:
        """Return the SHA-256 hash of a raw API key."""
        return hashlib.sha256(raw_key.encode()).hexdigest()

    @classmethod
    def create_key(
        cls,
        organization: Organization,
        name: str,
        scope: str,
        created_by=None,
        expires_at=None,
    ) -> tuple["APIKey", str]:
        """Create a new API key and return (instance, raw_key).

        The raw key is only available at creation time; it is stored hashed.
        """
        raw_key = _generate_api_key()
        instance = cls.objects.create(
            organization=organization,
            name=name,
            prefix=raw_key[:12],
            hashed_key=cls.hash_key(raw_key),
            scope=scope,
            created_by=created_by,
            expires_at=expires_at,
        )
        return instance, raw_key


class APIKeyLog(models.Model):
    """Log of API calls made with an API key."""

    api_key = models.ForeignKey(
        APIKey,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500)
    status_code = models.PositiveIntegerField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["api_key", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.method} {self.path} → {self.status_code}"


class Webhook(models.Model):
    """Configurable webhook for receiving event notifications."""

    class EventType(models.TextChoices):
        NEW_READING = "new_reading", "New Sensor Reading"
        ALERT_CREATED = "alert_created", "Alert Created"
        COMMAND_ACK = "command_ack", "Command Acknowledged"

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="webhooks",
    )
    name = models.CharField(max_length=100)
    url = models.URLField(max_length=500)
    secret = models.CharField(
        max_length=128,
        blank=True,
        help_text="Shared secret for HMAC-SHA256 signature verification",
    )
    events = models.JSONField(
        default=list,
        help_text="List of event types to subscribe to",
    )
    is_active = models.BooleanField(default=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    failure_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} → {self.url}"


class WebhookDelivery(models.Model):
    """Record of a webhook delivery attempt."""

    class Status(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"

    webhook = models.ForeignKey(
        Webhook,
        on_delete=models.CASCADE,
        related_name="deliveries",
    )
    event_type = models.CharField(max_length=20)
    payload = models.JSONField()
    response_status = models.PositiveIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices)
    error_message = models.TextField(blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Webhook deliveries"

    def __str__(self) -> str:
        return f"{self.event_type} → {self.webhook.name} [{self.status}]"
