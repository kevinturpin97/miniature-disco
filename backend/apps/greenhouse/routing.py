"""WebSocket URL routing for the greenhouse app."""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/sensors/(?P<zone_id>\d+)/$", consumers.SensorConsumer.as_asgi()),
    re_path(r"ws/alerts/$", consumers.AlertConsumer.as_asgi()),
    re_path(r"ws/commands/$", consumers.CommandConsumer.as_asgi()),
    re_path(
        r"ws/fleet/(?P<device_id>[0-9a-f-]+)/$",
        consumers.FleetConsumer.as_asgi(),
    ),
]
