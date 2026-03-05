"""
Serializers for authentication and organization endpoints in the Greenhouse SaaS API.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from .models import APIKey, APIKeyLog, Invitation, Membership, Organization, Webhook, WebhookDelivery

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration.

    Creates a personal Organization and OWNER Membership automatically.
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "password", "password2")

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data: dict) -> User:
        validated_data.pop("password2")
        user = User.objects.create_user(**validated_data)

        base_slug = slugify(user.username) or f"user-{user.pk}"
        slug = base_slug
        counter = 1
        while Organization.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization.objects.create(
            name=f"{user.username}'s Organization",
            slug=slug,
            plan=Organization.Plan.FREE,
        )
        Membership.objects.create(user=user, organization=org, role=Membership.Role.OWNER)
        return user


class UserSerializer(serializers.ModelSerializer):
    """Serializer for the authenticated user's profile."""

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "date_joined")
        read_only_fields = ("id", "date_joined")


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change endpoint."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


# ---------------------------------------------------------------------------
# Organization serializers
# ---------------------------------------------------------------------------

class OrganizationSerializer(serializers.ModelSerializer):
    """Serializer for Organization CRUD."""

    member_count = serializers.SerializerMethodField()
    greenhouse_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id", "name", "slug", "plan",
            "max_greenhouses", "max_zones",
            "member_count", "greenhouse_count", "my_role",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "slug", "plan", "max_greenhouses", "max_zones",
            "created_at", "updated_at",
        )

    def get_member_count(self, obj: Organization) -> int:
        return obj.memberships.count()

    def get_greenhouse_count(self, obj: Organization) -> int:
        return obj.greenhouses.count()

    def get_my_role(self, obj: Organization) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.memberships.filter(user=request.user).first()
        return membership.role if membership else None

    def create(self, validated_data: dict) -> Organization:
        user = self.context["request"].user
        name = validated_data["name"]
        base_slug = slugify(name) or "org"
        slug = base_slug
        counter = 1
        while Organization.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization.objects.create(name=name, slug=slug)
        Membership.objects.create(user=user, organization=org, role=Membership.Role.OWNER)
        return org


class MembershipSerializer(serializers.ModelSerializer):
    """Serializer for reading/updating memberships."""

    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Membership
        fields = ("id", "user", "username", "email", "organization", "role", "joined_at")
        read_only_fields = ("id", "user", "username", "email", "organization", "joined_at")


class InvitationCreateSerializer(serializers.Serializer):
    """Serializer for creating an invitation."""

    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=Membership.Role.choices, default=Membership.Role.VIEWER)

    def validate_email(self, value: str) -> str:
        org = self.context["organization"]
        if Membership.objects.filter(organization=org, user__email=value).exists():
            raise serializers.ValidationError("This user is already a member of the organization.")
        if Invitation.objects.filter(
            organization=org, email=value, accepted=False, expires_at__gt=timezone.now()
        ).exists():
            raise serializers.ValidationError("A pending invitation already exists for this email.")
        return value

    def validate_role(self, value: str) -> str:
        if value == Membership.Role.OWNER:
            raise serializers.ValidationError("Cannot invite as OWNER.")
        return value

    def create(self, validated_data: dict) -> Invitation:
        return Invitation.objects.create(
            organization=self.context["organization"],
            email=validated_data["email"],
            role=validated_data["role"],
            invited_by=self.context["request"].user,
            expires_at=timezone.now() + timedelta(hours=48),
        )


class InvitationSerializer(serializers.ModelSerializer):
    """Serializer for reading invitations."""

    organization_name = serializers.CharField(source="organization.name", read_only=True)
    invited_by_username = serializers.CharField(source="invited_by.username", read_only=True)

    class Meta:
        model = Invitation
        fields = (
            "id", "organization", "organization_name", "email", "role",
            "token", "invited_by", "invited_by_username",
            "accepted", "is_expired", "is_valid", "expires_at", "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------------
# API Key serializers (Sprint 21 — API Publique & Developer Platform)
# ---------------------------------------------------------------------------

class APIKeySerializer(serializers.ModelSerializer):
    """Serializer for reading and updating API keys.

    Exposes key metadata but never the raw key itself. The raw key is only
    returned once at creation time via APIKeyCreateResponseSerializer.
    """

    class Meta:
        model = APIKey
        fields = (
            "id", "organization", "name", "prefix", "scope",
            "is_active", "expires_at", "last_used_at",
            "created_by", "created_at",
        )
        read_only_fields = ("id", "prefix", "last_used_at", "created_by", "created_at")


class APIKeyCreateSerializer(serializers.Serializer):
    """Serializer for creating a new API key.

    Accepts only the fields that users should supply. The actual key
    generation is handled by APIKey.create_key().
    """

    name = serializers.CharField(required=True, max_length=100)
    scope = serializers.ChoiceField(choices=APIKey.Scope.choices, default=APIKey.Scope.READ)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_expires_at(self, value):
        """Ensure the expiry date is in the future if provided."""
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("Expiry date must be in the future.")
        return value


class APIKeyCreateResponseSerializer(serializers.Serializer):
    """Response serializer returned after creating a new API key.

    Contains both the key metadata and the raw key string. The raw key
    is only available at creation time and cannot be retrieved later.
    """

    key = APIKeySerializer()
    raw_key = serializers.CharField()


class APIKeyLogSerializer(serializers.ModelSerializer):
    """Serializer for API key usage logs.

    All fields are read-only as logs are created automatically by the
    API key authentication middleware.
    """

    class Meta:
        model = APIKeyLog
        fields = (
            "id", "api_key", "method", "path", "status_code",
            "ip_address", "user_agent", "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Webhook serializers (Sprint 21 — API Publique & Developer Platform)
# ---------------------------------------------------------------------------

class WebhookSerializer(serializers.ModelSerializer):
    """Serializer for creating, reading, and updating webhooks.

    The ``secret`` field is write-only — it is never returned in API
    responses.  Instead a boolean ``has_secret`` field indicates whether
    a secret has been configured.
    """

    has_secret = serializers.SerializerMethodField()
    secret = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=128,
    )

    class Meta:
        model = Webhook
        fields = (
            "id", "organization", "name", "url", "events",
            "is_active", "has_secret", "secret",
            "last_triggered_at", "failure_count",
            "created_by", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "organization", "has_secret",
            "last_triggered_at", "failure_count",
            "created_by", "created_at", "updated_at",
        )

    def get_has_secret(self, obj: Webhook) -> bool:
        """Return True if the webhook has a secret configured."""
        return bool(obj.secret)

    def validate_events(self, value: list) -> list:
        """Ensure every event type in the list is a valid Webhook.EventType."""
        valid_types = {choice[0] for choice in Webhook.EventType.choices}
        invalid = [evt for evt in value if evt not in valid_types]
        if invalid:
            raise serializers.ValidationError(
                f"Invalid event type(s): {', '.join(invalid)}. "
                f"Valid types are: {', '.join(sorted(valid_types))}."
            )
        return value


class WebhookDeliverySerializer(serializers.ModelSerializer):
    """Serializer for webhook delivery attempt records.

    All fields are read-only as deliveries are created automatically
    when webhooks are triggered.
    """

    class Meta:
        model = WebhookDelivery
        fields = (
            "id", "webhook", "event_type", "payload",
            "response_status", "response_body", "status",
            "error_message", "duration_ms", "created_at",
        )
        read_only_fields = fields
