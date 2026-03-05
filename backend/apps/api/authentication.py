"""Authentication backends for the Greenhouse SaaS API.

Includes:
- WebSocket JWT middleware for Django Channels
- API Key authentication for programmatic access (X-API-Key header)
"""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication
from rest_framework.request import Request
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import APIKey, Membership

User = get_user_model()


# ---------------------------------------------------------------------------
# WebSocket JWT middleware
# ---------------------------------------------------------------------------

@database_sync_to_async
def get_user_from_token(token_str: str) -> Any:
    """Validate a JWT access token and return the corresponding user.

    Args:
        token_str: Raw JWT access token string.

    Returns:
        User instance or AnonymousUser if the token is invalid.
    """
    try:
        token = AccessToken(token_str)
        user_id = token["user_id"]
        return User.objects.get(pk=user_id)
    except (InvalidToken, TokenError, User.DoesNotExist, KeyError):
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    """Channels middleware that authenticates WebSocket connections via JWT.

    The client connects with ``ws://host/ws/path/?token=<access_token>``.
    """

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        """Extract token from query string and resolve user."""
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token_list = params.get("token", [])

        if token_list:
            scope["user"] = await get_user_from_token(token_list[0])
        else:
            scope["user"] = AnonymousUser()

        await super().__call__(scope, receive, send)


# ---------------------------------------------------------------------------
# API Key authentication
# ---------------------------------------------------------------------------

class APIKeyAuthentication(BaseAuthentication):
    """Authenticate requests using an API key passed in the X-API-Key header.

    On successful authentication the request gains:
    - ``request.user``: The first OWNER of the organization (service account)
    - ``request.auth``: The APIKey model instance
    - ``request.api_key``: Alias for the APIKey instance (used in permissions/throttling)
    """

    keyword = "X-API-Key"

    def authenticate(self, request: Request) -> tuple[Any, APIKey] | None:
        """Authenticate the request if X-API-Key header is present."""
        raw_key = request.META.get("HTTP_X_API_KEY")
        if not raw_key:
            return None

        hashed = APIKey.hash_key(raw_key)
        try:
            api_key = APIKey.objects.select_related("organization").get(hashed_key=hashed)
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed("Invalid API key.")

        if not api_key.is_usable:
            if api_key.is_expired:
                raise exceptions.AuthenticationFailed("API key has expired.")
            raise exceptions.AuthenticationFailed("API key is inactive.")

        # Update last_used_at
        APIKey.objects.filter(pk=api_key.pk).update(last_used_at=timezone.now())

        # Resolve user: first OWNER of the organization
        owner_membership = Membership.objects.filter(
            organization=api_key.organization,
            role=Membership.Role.OWNER,
        ).select_related("user").first()

        if not owner_membership:
            raise exceptions.AuthenticationFailed("Organization has no owner.")

        user = owner_membership.user

        # Attach api_key to request for downstream use
        request.api_key = api_key

        return (user, api_key)

    def authenticate_header(self, request: Request) -> str:
        """Return the header name for WWW-Authenticate."""
        return self.keyword
