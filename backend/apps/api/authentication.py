"""WebSocket JWT authentication middleware for Django Channels.

Extracts a JWT access token from the ``token`` query-string parameter
and populates ``scope["user"]`` accordingly.

Usage in ASGI routing::

    JwtAuthMiddleware(URLRouter(websocket_urlpatterns))
"""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


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
