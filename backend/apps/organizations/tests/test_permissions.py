"""Tests for custom DRF permissions."""

import pytest

from apps.api.permissions import IsGreenhouseOwner, IsOwner, IsOwnerOrReadOnly
from conftest import GreenhouseFactory, UserFactory


@pytest.mark.django_db
class TestIsOwnerOrReadOnly:
    """IsOwnerOrReadOnly: safe methods always pass; unsafe require ownership."""

    def _make_request(self, method: str, user):
        """Build a minimal mock request object."""

        class Req:
            pass

        req = Req()
        req.method = method
        req.user = user
        return req

    def test_get_allows_any_user(self, user, greenhouse):
        perm = IsOwnerOrReadOnly()
        req = self._make_request("GET", user)
        assert perm.has_object_permission(req, None, greenhouse) is True

    def test_get_allows_anonymous(self, greenhouse):
        from django.contrib.auth.models import AnonymousUser

        perm = IsOwnerOrReadOnly()

        class Req:
            method = "GET"
            user = AnonymousUser()

        assert perm.has_object_permission(Req(), None, greenhouse) is True

    def test_patch_allows_owner(self, user, greenhouse):
        perm = IsOwnerOrReadOnly()
        req = self._make_request("PATCH", user)
        assert perm.has_object_permission(req, None, greenhouse) is True

    def test_patch_denies_non_owner(self, other_user, greenhouse):
        perm = IsOwnerOrReadOnly()
        req = self._make_request("PATCH", other_user)
        assert perm.has_object_permission(req, None, greenhouse) is False

    def test_delete_denies_non_owner(self, other_user, greenhouse):
        perm = IsOwnerOrReadOnly()
        req = self._make_request("DELETE", other_user)
        assert perm.has_object_permission(req, None, greenhouse) is False


@pytest.mark.django_db
class TestIsOwner:
    """IsOwner: only the owner can access regardless of method."""

    def _make_request(self, user):
        class Req:
            pass

        req = Req()
        req.method = "GET"
        req.user = user
        return req

    def test_allows_owner(self, user, greenhouse):
        perm = IsOwner()
        req = self._make_request(user)
        assert perm.has_object_permission(req, None, greenhouse) is True

    def test_denies_other_user(self, other_user, greenhouse):
        perm = IsOwner()
        req = self._make_request(other_user)
        assert perm.has_object_permission(req, None, greenhouse) is False


@pytest.mark.django_db
class TestIsGreenhouseOwner:
    """IsGreenhouseOwner: traverses ownership chain for nested resources."""

    def _make_request(self, user):
        class Req:
            pass

        req = Req()
        req.method = "GET"
        req.user = user
        req.auth = None
        return req

    def test_greenhouse_owner_allowed(self, user, greenhouse):
        perm = IsGreenhouseOwner()
        req = self._make_request(user)
        assert perm.has_object_permission(req, None, greenhouse) is True

    def test_greenhouse_non_owner_denied(self, other_user, greenhouse):
        perm = IsGreenhouseOwner()
        req = self._make_request(other_user)
        assert perm.has_object_permission(req, None, greenhouse) is False

    def test_zone_owner_allowed(self, user, zone):
        perm = IsGreenhouseOwner()
        req = self._make_request(user)
        assert perm.has_object_permission(req, None, zone) is True

    def test_zone_non_owner_denied(self, other_user, zone):
        perm = IsGreenhouseOwner()
        req = self._make_request(other_user)
        assert perm.has_object_permission(req, None, zone) is False

    def test_sensor_owner_allowed(self, user, sensor):
        perm = IsGreenhouseOwner()
        req = self._make_request(user)
        assert perm.has_object_permission(req, None, sensor) is True

    def test_actuator_owner_allowed(self, user, actuator):
        perm = IsGreenhouseOwner()
        req = self._make_request(user)
        assert perm.has_object_permission(req, None, actuator) is True
