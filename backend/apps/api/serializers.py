"""
Serializers for authentication endpoints in the Greenhouse SaaS API.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration.

    Args:
        username: Unique username.
        email: User email address.
        password: Password (write-only, validated against Django validators).
        password2: Password confirmation (write-only).
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("username", "email", "password", "password2")

    def validate(self, attrs: dict) -> dict:
        """Ensure both passwords match."""
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data: dict) -> User:
        """Create and return a new user without password2."""
        validated_data.pop("password2")
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    """Serializer for reading and updating the authenticated user's profile.

    Fields:
        id: User primary key (read-only).
        username: Unique username.
        email: User email address.
        first_name: First name.
        last_name: Last name.
        date_joined: Account creation date (read-only).
    """

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "date_joined")
        read_only_fields = ("id", "date_joined")
