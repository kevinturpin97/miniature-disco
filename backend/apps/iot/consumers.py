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
from apps.api.models import Membership

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


class CommandConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for live command status updates.

    URL: ``/ws/commands/``

    Clients must connect with ``?token=<JWT>`` query parameter.
    The user receives command status updates for all their greenhouses.

    Messages pushed to the client::

        {
            "type": "command_status_update",
            "command_id": 1,
            "actuator_id": 1,
            "status": "SENT",
            "sent_at": "2024-01-01T00:00:00Z",
            "acknowledged_at": null,
            "error_message": ""
        }
    """

    async def connect(self) -> None:
        """Join the user's command group after authentication."""
        user = self.scope.get("user", AnonymousUser())

        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.group_name = f"commands_{user.pk}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("WebSocket commands connected: user=%s", user.pk)

    async def disconnect(self, code: int) -> None:
        """Leave the command group on disconnect."""
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content: dict, **kwargs: Any) -> None:
        """Client-to-server messages are not expected; ignore them."""
        pass

    async def command_status_update(self, event: dict) -> None:
        """Push a command status update event to the WebSocket client."""
        await self.send_json(event)


class FleetConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for live OTA status and device metrics updates.

    URL: ``/ws/fleet/{device_id}/``

    Clients must connect with ``?token=<JWT>`` query parameter.
    The user must be a member of the organisation that owns the device.

    Messages pushed to the client::

        {
            "type": "ota_status_update",
            "job_id": 1,
            "device_id": "uuid-string",
            "status": "DOWNLOADING",
            "progress_percent": 43,
            "firmware_version": "3.2.2",
            "error_message": ""
        }

        {
            "type": "device_metrics_update",
            "device_id": "uuid-string",
            "cpu_percent": 45.0,
            "memory_percent": 60.0,
            "disk_percent": 72.0,
            "cpu_temperature": 52.0,
            "uptime_seconds": 123456,
            "network_latency_ms": 34,
            "recorded_at": "2026-03-14T10:00:00Z"
        }
    """

    async def connect(self) -> None:
        """Join the device's fleet group after membership validation."""
        self.device_id = self.scope["url_route"]["kwargs"]["device_id"]
        self.group_name = f"fleet_{self.device_id}"
        user = self.scope.get("user", AnonymousUser())

        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        is_member = await self._check_device_membership(user.pk, self.device_id)
        if not is_member:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info(
            "WebSocket fleet connected: user=%s device=%s",
            user.pk,
            self.device_id,
        )

    async def disconnect(self, code: int) -> None:
        """Leave the fleet group on disconnect."""
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content: dict, **kwargs) -> None:
        """Client-to-server messages are not expected; ignore them."""
        pass

    async def ota_status_update(self, event: dict) -> None:
        """Push an OTA status change to the WebSocket client."""
        await self.send_json(event)

    async def device_metrics_update(self, event: dict) -> None:
        """Push a device metrics snapshot to the WebSocket client."""
        await self.send_json(event)

    @database_sync_to_async
    def _check_device_membership(self, user_id: int, device_id: str) -> bool:
        """Return True if the user is a member of the org that owns the device."""
        from .models import EdgeDevice

        return EdgeDevice.objects.filter(
            device_id=device_id,
            is_active=True,
            organization__memberships__user_id=user_id,
        ).exists()
