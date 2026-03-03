"""WebSocket URL routing for the IoT app."""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/sensors/(?P<zone_id>\d+)/$", consumers.SensorConsumer.as_asgi()),
    re_path(r"ws/alerts/$", consumers.AlertConsumer.as_asgi()),
]
