"""Cloud app models — CloudTenant, ImpersonationToken."""

from django.conf import settings
from django.db import models

from apps.organizations.models import Organization


class CloudTenant(models.Model):
    """Cloud-side representation of a client organization running an edge device.

    Links an organization to its edge devices and stores cloud-specific metadata
    such as storage usage, last activity, and support notes.
    """

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="cloud_tenant",
        help_text="The organization this tenant record belongs to",
    )
    # M2M to edge devices — an org may have several Raspberry Pi units
    edge_devices = models.ManyToManyField(
        "fleet.EdgeDevice",
        blank=True,
        related_name="cloud_tenants",
        help_text="Raspberry Pi devices registered for this tenant",
    )
    cloud_storage_mb = models.FloatField(
        default=0.0,
        help_text="Estimated cloud storage used by this tenant in MB",
    )
    last_activity = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last sync or API call from this tenant",
    )
    support_notes = models.TextField(
        blank=True,
        help_text="Internal support notes visible only to operators",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_activity", "organization__name"]
        verbose_name = "Cloud Tenant"
        verbose_name_plural = "Cloud Tenants"
        db_table = "api_cloudtenant"

    def __str__(self) -> str:
        return f"CloudTenant({self.organization.name})"


class ImpersonationToken(models.Model):
    """Short-lived token that lets a support operator act as a client user.

    Expires after 30 minutes. Recorded in the audit log on use.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="impersonation_tokens",
        help_text="The client organization being impersonated",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="issued_impersonation_tokens",
        help_text="The operator who issued this token",
    )
    token = models.CharField(
        max_length=128,
        unique=True,
        help_text="Opaque token string (never store raw — hashed in DB)",
    )
    expires_at = models.DateTimeField(help_text="Token becomes invalid after this time")
    used_at = models.DateTimeField(null=True, blank=True)
    is_revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        db_table = "api_impersonationtoken"

    def __str__(self) -> str:
        return f"ImpersonationToken({self.organization.name} by {self.created_by})"

    @property
    def is_valid(self) -> bool:
        """Return True if the token can still be used."""
        from django.utils import timezone

        return not self.is_revoked and timezone.now() < self.expires_at
