"""Tests for WebSocket consumers (SensorConsumer and AlertConsumer)."""

from __future__ import annotations

import pytest
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from apps.iot.routing import websocket_urlpatterns
from conftest import GreenhouseFactory, ZoneFactory

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


@database_sync_to_async
def create_user(username: str = "wsuser") -> User:
    """Create a test user and return it."""
    user = User.objects.create_user(
        username=username,
        email=f"{username}@test.com",
        password="testpass123!",
    )
    return user


@database_sync_to_async
def create_zone_with_owner(user: User) -> int:
    """Create a greenhouse + zone owned by user, return zone pk."""
    gh = GreenhouseFactory(owner=user)
    zone = ZoneFactory(greenhouse=gh)
    return zone.pk


def _make_application():
    """Build a minimal ASGI app with JWT auth middleware for testing."""
    from channels.routing import ProtocolTypeRouter, URLRouter

    from apps.api.authentication import JwtAuthMiddleware

    return ProtocolTypeRouter(
        {
            "websocket": JwtAuthMiddleware(URLRouter(websocket_urlpatterns)),
        }
    )


def _communicator_for(path: str, token: str | None = None) -> WebsocketCommunicator:
    """Create a WebsocketCommunicator for the given path."""
    app = _make_application()
    url = path
    if token:
        url = f"{path}?token={token}"
    return WebsocketCommunicator(app, url)


# ── Fixtures ─────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _use_in_memory_channel_layer(settings):
    """Override CHANNEL_LAYERS to use InMemoryChannelLayer for all tests."""
    settings.CHANNEL_LAYERS = TEST_CHANNEL_LAYERS


# ── SensorConsumer tests ─────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSensorConsumer:
    """Tests for the SensorConsumer WebSocket endpoint."""

    async def test_authenticated_owner_connects(self):
        """Authenticated zone owner can connect."""
        user = await create_user("sensor_owner")
        zone_id = await create_zone_with_owner(user)
        token = str(AccessToken.for_user(user))

        communicator = _communicator_for(f"/ws/sensors/{zone_id}/", token)
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_unauthenticated_rejected(self):
        """Connection without token is rejected with code 4001."""
        communicator = _communicator_for("/ws/sensors/1/")
        connected, code = await communicator.connect()

        assert connected is False

    async def test_invalid_token_rejected(self):
        """Connection with invalid token is rejected."""
        communicator = _communicator_for("/ws/sensors/1/", "invalid-token")
        connected, code = await communicator.connect()

        assert connected is False

    async def test_non_owner_rejected(self):
        """Authenticated user who doesn't own the zone is rejected with 4003."""
        owner = await create_user("zone_owner")
        other = await create_user("other_user")
        zone_id = await create_zone_with_owner(owner)
        token = str(AccessToken.for_user(other))

        communicator = _communicator_for(f"/ws/sensors/{zone_id}/", token)
        connected, code = await communicator.connect()

        assert connected is False

    async def test_receives_sensor_reading_event(self):
        """Connected client receives sensor_reading events pushed to the group."""
        user = await create_user("reading_user")
        zone_id = await create_zone_with_owner(user)
        token = str(AccessToken.for_user(user))

        communicator = _communicator_for(f"/ws/sensors/{zone_id}/", token)
        connected, _ = await communicator.connect()
        assert connected is True

        # Push a message to the channel group
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"sensors_{zone_id}",
            {
                "type": "sensor_reading",
                "sensor_type": "TEMP",
                "value": 23.45,
                "sensor_id": 1,
                "zone_id": zone_id,
                "received_at": "2024-01-01T00:00:00Z",
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "sensor_reading"
        assert response["sensor_type"] == "TEMP"
        assert response["value"] == 23.45
        assert response["zone_id"] == zone_id

        await communicator.disconnect()


# ── AlertConsumer tests ──────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestAlertConsumer:
    """Tests for the AlertConsumer WebSocket endpoint."""

    async def test_authenticated_connects(self):
        """Authenticated user can connect to alerts."""
        user = await create_user("alert_user")
        token = str(AccessToken.for_user(user))

        communicator = _communicator_for("/ws/alerts/", token)
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_unauthenticated_rejected(self):
        """Connection without token is rejected."""
        communicator = _communicator_for("/ws/alerts/")
        connected, code = await communicator.connect()

        assert connected is False

    async def test_receives_alert_notification(self):
        """Connected client receives alert_notification events."""
        user = await create_user("alert_recv")
        token = str(AccessToken.for_user(user))

        communicator = _communicator_for("/ws/alerts/", token)
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"alerts_{user.pk}",
            {
                "type": "alert_notification",
                "alert_id": 99,
                "alert_type": "HIGH",
                "severity": "WARNING",
                "zone_id": 1,
                "zone_name": "Zone A",
                "message": "Temperature is too high",
                "created_at": "2024-01-01T00:00:00Z",
            },
        )

        response = await communicator.receive_json_from()
        assert response["type"] == "alert_notification"
        assert response["alert_id"] == 99
        assert response["severity"] == "WARNING"
        assert response["message"] == "Temperature is too high"

        await communicator.disconnect()
