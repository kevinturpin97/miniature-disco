"""Authentication backends — re-exported from apps.developer for backward compatibility.

The canonical implementation lives in apps.developer.authentication.
This module exists to avoid breaking existing imports during the migration.
"""

from apps.developer.authentication import (  # noqa: F401
    APIKeyAuthentication,
    JwtAuthMiddleware,
    get_user_from_token,
)
