"""WebSocket consumers for real-time sensor data and alert streaming.

Groups:
    ``sensors_{zone_id}``  — sensor readings for a specific zone.
    ``alerts_{user_id}``   — alerts for greenhouses owned by a user.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from .models import Zone

logger = logging.getLogger(__name__)


class SensorConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for live sensor readings in a zone.

    URL: ``/ws/sensors/{zone_id}/``

    Clients must connect with ``?token=<JWT>`` query parameter.
    Only the greenhouse owner can subscribe to a zone's sensor stream.

    Messages pushed to the client::

        {
            "type": "sensor_reading",
            "sensor_type": "TEMP",
            "value": 23.45,
            "sensor_id": 1,
            "zone_id": 1,
            "received_at": "2024-01-01T00:00:00Z"
        }
    """

    async def connect(self) -> None:
        """Join the zone's sensor group after ownership validation."""
        self.zone_id = self.scope["url_route"]["kwargs"]["zone_id"]
        self.group_name = f"sensors_{self.zone_id}"
        user = self.scope.get("user", AnonymousUser())

        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        # Verify zone ownership
        is_owner = await self._check_zone_ownership(user.pk, self.zone_id)
        if not is_owner:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info(
            "WebSocket connected: user=%s zone=%s",
            user.pk,
            self.zone_id,
        )

    async def disconnect(self, code: int) -> None:
        """Leave the sensor group on disconnect."""
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content: dict, **kwargs: Any) -> None:
        """Client-to-server messages are not expected; ignore them."""
        pass

    async def sensor_reading(self, event: dict) -> None:
        """Push a sensor reading event to the WebSocket client."""
        await self.send_json(event)

    @database_sync_to_async
    def _check_zone_ownership(self, user_id: int, zone_id: int) -> bool:
        """Return True if the zone belongs to a greenhouse owned by user_id."""
        return Zone.objects.filter(
            pk=zone_id,
            greenhouse__owner_id=user_id,
        ).exists()


class AlertConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for live alert notifications.

    URL: ``/ws/alerts/``

    Clients must connect with ``?token=<JWT>`` query parameter.
    The user receives alerts for all greenhouses they own.

    Messages pushed to the client::

        {
            "type": "alert_notification",
            "alert_id": 1,
            "alert_type": "HIGH",
            "severity": "WARNING",
            "zone_id": 1,
            "zone_name": "Zone A",
            "message": "Temperature in Zone A is 35.0 (above threshold 30.0)",
            "created_at": "2024-01-01T00:00:00Z"
        }
    """

    async def connect(self) -> None:
        """Join the user's alert group after authentication."""
        user = self.scope.get("user", AnonymousUser())

        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.group_name = f"alerts_{user.pk}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("WebSocket alerts connected: user=%s", user.pk)

    async def disconnect(self, code: int) -> None:
        """Leave the alert group on disconnect."""
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content: dict, **kwargs: Any) -> None:
        """Client-to-server messages are not expected; ignore them."""
        pass

    async def alert_notification(self, event: dict) -> None:
        """Push an alert notification event to the WebSocket client."""
        await self.send_json(event)
