"""
Custom permission classes for the Greenhouse SaaS API.
"""

from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request

from .models import Membership


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_greenhouse(obj):
    """Traverse the object hierarchy to find the associated Greenhouse."""
    if hasattr(obj, "organization"):
        # obj IS a Greenhouse
        return obj
    if hasattr(obj, "greenhouse"):
        return obj.greenhouse
    if hasattr(obj, "zone"):
        return obj.zone.greenhouse
    if hasattr(obj, "sensor"):
        return obj.sensor.zone.greenhouse
    if hasattr(obj, "actuator"):
        return obj.actuator.zone.greenhouse
    return None


def _get_user_membership(user, greenhouse) -> Membership | None:
    """Return the user's membership for the greenhouse's organization, or None."""
    if greenhouse is None or greenhouse.organization_id is None:
        return None
    try:
        return Membership.objects.get(user=user, organization_id=greenhouse.organization_id)
    except Membership.DoesNotExist:
        return None


# ---------------------------------------------------------------------------
# Legacy permissions (kept for backward-compat during transition)
# ---------------------------------------------------------------------------

class IsOwnerOrReadOnly(BasePermission):
    """Allow read-only access to any authenticated request, write only to the object owner."""

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return getattr(obj, "owner", None) == request.user


class IsOwner(BasePermission):
    """Allow access only to the owner of the object."""

    def has_object_permission(self, request, view, obj) -> bool:
        return getattr(obj, "owner", None) == request.user


# ---------------------------------------------------------------------------
# Organization-based permissions
# ---------------------------------------------------------------------------

class IsOrganizationMember(BasePermission):
    """Allow access only to members of the greenhouse's organization.

    Traverses the ownership chain to find the Greenhouse, then checks
    that the requesting user has *any* role in that organization.
    """

    def has_permission(self, request: Request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view, obj) -> bool:
        greenhouse = _get_greenhouse(obj)
        return _get_user_membership(request.user, greenhouse) is not None


class HasRole(BasePermission):
    """Allow access only to org members whose role level meets a minimum.

    Usage in a ViewSet::

        permission_classes = [IsAuthenticated, HasRole]
        required_role = "OPERATOR"

    Role hierarchy (low → high): VIEWER < OPERATOR < ADMIN < OWNER
    """

    def has_permission(self, request: Request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view, obj) -> bool:
        required = getattr(view, "required_role", Membership.Role.VIEWER)
        required_level = Membership.ROLE_HIERARCHY.get(required, 0)

        greenhouse = _get_greenhouse(obj)
        membership = _get_user_membership(request.user, greenhouse)
        if membership is None:
            return False
        return membership.role_level >= required_level


class IsGreenhouseOwner(BasePermission):
    """Allow access only to members of the greenhouse's organization.

    Updated to use organization membership instead of direct owner field.
    Falls back to legacy owner check if organization is not set.
    """

    def has_permission(self, request: Request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view, obj) -> bool:
        greenhouse = _get_greenhouse(obj)
        if greenhouse is None:
            return False

        # Organization-based check
        if greenhouse.organization_id is not None:
            membership = _get_user_membership(request.user, greenhouse)
            return membership is not None

        # Legacy fallback
        return getattr(greenhouse, "owner", None) == request.user
