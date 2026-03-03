"""
Custom permission classes for the Greenhouse SaaS API.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOwnerOrReadOnly(BasePermission):
    """Allow read-only access to any authenticated request, write only to the object owner.

    The object must have an ``owner`` attribute pointing to a User instance.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return obj.owner == request.user


class IsOwner(BasePermission):
    """Allow access only to the owner of the object.

    The object must have an ``owner`` attribute pointing to a User instance.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        return obj.owner == request.user


class IsGreenhouseOwner(BasePermission):
    """Allow access only to the owner of the greenhouse the object belongs to.

    Traverses the ownership chain: owner -> greenhouse.owner -> zone.greenhouse.owner
    -> sensor.zone.greenhouse.owner -> actuator.zone.greenhouse.owner.
    """

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj) -> bool:
        if hasattr(obj, "owner"):
            return obj.owner == request.user
        if hasattr(obj, "greenhouse"):
            return obj.greenhouse.owner == request.user
        if hasattr(obj, "zone"):
            return obj.zone.greenhouse.owner == request.user
        if hasattr(obj, "sensor"):
            return obj.sensor.zone.greenhouse.owner == request.user
        if hasattr(obj, "actuator"):
            return obj.actuator.zone.greenhouse.owner == request.user
        return False
