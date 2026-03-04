"""
Serializers for authentication and organization endpoints in the Greenhouse SaaS API.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from .models import Invitation, Membership, Organization

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
