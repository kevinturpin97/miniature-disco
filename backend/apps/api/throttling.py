"""Throttling and permission classes for API key authentication.

Provides dynamic rate limiting based on organization plan and
scope-based permission enforcement for API key access.
"""

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from .models import APIKey


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
        """Return a cache key based on the API key prefix.

        Args:
            request: The incoming DRF request.
            view: The view being accessed.

        Returns:
            A cache key string if the request is API-key authenticated,
            or ``None`` to skip throttling for non-API-key requests.
        """
        auth = request.auth
        if auth is None or not hasattr(auth, "prefix"):
            return None
        return self.cache_format % {"scope": self.scope, "ident": auth.prefix}

    def get_rate(self) -> str:
        """Return the rate limit string from the API key's org plan.

        The rate is determined dynamically from ``request.auth.rate_limit``
        which returns requests-per-minute based on the organization's plan.

        Returns:
            A rate string in the format ``"{n}/minute"``.
        """
        if not hasattr(self, "_request") or self._request is None:
            return "60/minute"
        auth = self._request.auth
        if auth is None or not hasattr(auth, "rate_limit"):
            return "60/minute"
        return f"{auth.rate_limit}/minute"

    def allow_request(self, request: Request, view: APIView) -> bool:
        """Check if the request should be throttled.

        Stores a reference to the request so ``get_rate`` can access
        ``request.auth`` for dynamic rate determination.

        Args:
            request: The incoming DRF request.
            view: The view being accessed.

        Returns:
            ``True`` if the request is allowed, ``False`` if throttled.
        """
        # Store request reference so get_rate() can access auth dynamically
        self._request = request

        # Skip throttling for non-API-key requests
        if request.auth is None or not hasattr(request.auth, "prefix"):
            return True

        # Parse rate and set attributes before parent logic
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)

        return super().allow_request(request, view)


class HasAPIKeyScope(BasePermission):
    """Permission class that enforces API key scope restrictions.

    Checks whether the authenticated API key has sufficient scope for the
    HTTP method being used:

    - **READ** (level 0): ``GET``, ``HEAD``, ``OPTIONS``
    - **WRITE** (level 1): ``GET``, ``HEAD``, ``OPTIONS``, ``POST``, ``PATCH``, ``PUT``
    - **ADMIN** (level 2): all methods including ``DELETE``

    If the request is not authenticated via an API key (e.g. JWT auth),
    the permission check is skipped and access is granted.
    """

    # Methods allowed at each scope level (cumulative)
    SCOPE_METHODS: dict[int, set[str]] = {
        0: {"GET", "HEAD", "OPTIONS"},
        1: {"GET", "HEAD", "OPTIONS", "POST", "PATCH", "PUT"},
        2: {"GET", "HEAD", "OPTIONS", "POST", "PATCH", "PUT", "DELETE"},
    }

    def has_permission(self, request: Request, view: APIView) -> bool:
        """Check if the API key scope allows the request method.

        Args:
            request: The incoming DRF request.
            view: The view being accessed.

        Returns:
            ``True`` if the request is allowed, ``False`` otherwise.
        """
        auth = request.auth

        # If not API-key authenticated (e.g. JWT), allow the request
        if not isinstance(auth, APIKey):
            return True

        scope_level = auth.scope_level
        allowed_methods = self.SCOPE_METHODS.get(scope_level, set())
        return request.method in allowed_methods
