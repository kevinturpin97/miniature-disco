"""Server-Sent Events (SSE) streaming for real-time sensor readings.

Provides a streaming HTTP endpoint that pushes new sensor readings
as they arrive, using the SSE protocol.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import timedelta

from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from apps.api.models import Membership

from .models import Sensor, SensorReading, Zone

logger = logging.getLogger(__name__)

# How often to check for new readings (seconds)
POLL_INTERVAL = 2.0

# Maximum connection duration (seconds) to prevent zombie connections
MAX_CONNECTION_DURATION = 300  # 5 minutes


def _user_org_ids(user) -> list[int]:
    """Return the list of organization IDs the user is a member of."""
    return list(
        Membership.objects.filter(user=user).values_list("organization_id", flat=True)
    )


def _format_sse(data: dict, event: str = "message") -> str:
    """Format data as an SSE message.

    Args:
        data: Dict to serialize as JSON.
        event: SSE event name.

    Returns:
        SSE-formatted string.
    """
    json_str = json.dumps(data, default=str)
    return f"event: {event}\ndata: {json_str}\n\n"


def _stream_readings(zone_id: int, user):
    """Generator that yields SSE events for new sensor readings.

    Args:
        zone_id: The zone to stream readings for.
        user: The authenticated user.

    Yields:
        SSE-formatted strings with sensor reading data.
    """
    org_ids = _user_org_ids(user)
    zone = get_object_or_404(
        Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
    )

    sensors = list(
        Sensor.objects.filter(zone=zone, is_active=True).values_list("id", flat=True)
    )

    # Send initial connection event
    yield _format_sse(
        {
            "type": "connected",
            "zone_id": zone.pk,
            "zone_name": zone.name,
            "sensor_count": len(sensors),
            "timestamp": timezone.now().isoformat(),
        },
        event="connected",
    )

    # Send latest reading for each sensor as initial state
    for sensor_id in sensors:
        latest = (
            SensorReading.objects.filter(sensor_id=sensor_id)
            .select_related("sensor")
            .order_by("-received_at")
            .first()
        )
        if latest:
            yield _format_sse(
                {
                    "type": "reading",
                    "sensor_id": latest.sensor_id,
                    "sensor_type": latest.sensor.sensor_type,
                    "value": latest.value,
                    "received_at": latest.received_at.isoformat(),
                },
                event="reading",
            )

    # Track last seen reading ID for efficient polling
    last_id = (
        SensorReading.objects.filter(sensor_id__in=sensors)
        .order_by("-id")
        .values_list("id", flat=True)
        .first()
    ) or 0

    start_time = time.monotonic()

    while True:
        # Check connection duration limit
        elapsed = time.monotonic() - start_time
        if elapsed > MAX_CONNECTION_DURATION:
            yield _format_sse(
                {
                    "type": "timeout",
                    "message": "Connection duration limit reached. Please reconnect.",
                    "duration_seconds": int(elapsed),
                },
                event="timeout",
            )
            break

        # Poll for new readings
        new_readings = (
            SensorReading.objects.filter(
                sensor_id__in=sensors,
                id__gt=last_id,
            )
            .select_related("sensor")
            .order_by("id")[:100]  # Cap batch size
        )

        for reading in new_readings:
            yield _format_sse(
                {
                    "type": "reading",
                    "sensor_id": reading.sensor_id,
                    "sensor_type": reading.sensor.sensor_type,
                    "value": reading.value,
                    "received_at": reading.received_at.isoformat(),
                },
                event="reading",
            )
            last_id = reading.id

        # Send heartbeat to keep connection alive
        yield _format_sse(
            {"type": "heartbeat", "timestamp": timezone.now().isoformat()},
            event="heartbeat",
        )

        time.sleep(POLL_INTERVAL)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stream_zone_readings(request, pk: int):
    """Stream sensor readings for a zone via Server-Sent Events.

    Endpoint: GET /api/zones/{id}/readings/stream/

    The stream sends:
    - ``connected`` event on connection with zone info
    - ``reading`` events for each new sensor reading
    - ``heartbeat`` events every 2 seconds
    - ``timeout`` event after 5 minutes (client should reconnect)

    Returns:
        StreamingHttpResponse with text/event-stream content type.
    """
    response = StreamingHttpResponse(
        _stream_readings(pk, request.user),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # Disable nginx buffering
    return response
