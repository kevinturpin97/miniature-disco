"""Throttling and permission classes for API key authentication.

Provides dynamic rate limiting based on organization plan and
scope-based permission enforcement for API key access.
"""

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.developer.models import APIKey


class APIKeyRateThrottle(SimpleRateThrottle):
    """Dynamic rate throttle for API key authenticated requests.

    Uses the API key prefix as the cache key and determines the rate limit
    dynamically from the organization's plan via ``request.auth.rate_limit``.

    Requests that are not authenticated via API key (e.g. JWT) are not
    throttled by this class and will pass through.

    Attributes:
        scope: The throttle scope identifier used for cache key namespacing.
    """

    scope = "api_key"

    def get_cache_key(self, request: Request, view: APIView) -> str | None:
        """Return a cache key based on the API key prefix."""
        auth = request.auth
        if auth is None or not hasattr(auth, "prefix"):
            return None
        return self.cache_format % {"scope": self.scope, "ident": auth.prefix}

    def get_rate(self) -> str:
        """Return the rate limit string from the API key's org plan."""
        if not hasattr(self, "_request") or self._request is None:
            return "60/minute"
        auth = self._request.auth
        if auth is None or not hasattr(auth, "rate_limit"):
            return "60/minute"
        return f"{auth.rate_limit}/minute"

    def allow_request(self, request: Request, view: APIView) -> bool:
        """Check if the request should be throttled."""
        self._request = request
        if request.auth is None or not hasattr(request.auth, "prefix"):
            return True
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)


class HasAPIKeyScope(BasePermission):
    """Permission class that enforces API key scope restrictions."""

    SCOPE_METHODS: dict[int, set[str]] = {
        0: {"GET", "HEAD", "OPTIONS"},
        1: {"GET", "HEAD", "OPTIONS", "POST", "PATCH", "PUT"},
        2: {"GET", "HEAD", "OPTIONS", "POST", "PATCH", "PUT", "DELETE"},
    }

    def has_permission(self, request: Request, view: APIView) -> bool:
        """Check if the API key scope allows the request method."""
        auth = request.auth
        if not isinstance(auth, APIKey):
            return True
        scope_level = auth.scope_level
        allowed_methods = self.SCOPE_METHODS.get(scope_level, set())
        return request.method in allowed_methods
