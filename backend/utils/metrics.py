"""Custom Prometheus metrics for the Greenhouse SaaS platform.

Exposes application-specific counters and gauges alongside the default
django-prometheus metrics available at ``/metrics``.
"""

from prometheus_client import Counter, Gauge, Histogram

# Sensor readings ingested
SENSOR_READINGS_TOTAL = Counter(
    "greenhouse_sensor_readings_total",
    "Total number of sensor readings ingested",
    ["sensor_type", "zone_id"],
)

# Commands processed
COMMANDS_TOTAL = Counter(
    "greenhouse_commands_total",
    "Total number of commands processed",
    ["command_type", "status"],
)

# Active alerts
ACTIVE_ALERTS = Gauge(
    "greenhouse_active_alerts",
    "Number of unacknowledged alerts",
    ["severity"],
)

# Automation rules triggered
AUTOMATION_TRIGGERS_TOTAL = Counter(
    "greenhouse_automation_triggers_total",
    "Total number of automation rule triggers",
)

# MQTT messages received
MQTT_MESSAGES_TOTAL = Counter(
    "greenhouse_mqtt_messages_total",
    "Total number of MQTT messages received",
    ["topic_prefix"],
)

# WebSocket connections
WEBSOCKET_CONNECTIONS = Gauge(
    "greenhouse_websocket_connections",
    "Current number of active WebSocket connections",
    ["consumer_type"],
)

# API request duration (supplementary to django-prometheus built-in)
API_REQUEST_DURATION = Histogram(
    "greenhouse_api_request_duration_seconds",
    "API request duration in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

# Notification dispatch
NOTIFICATIONS_SENT_TOTAL = Counter(
    "greenhouse_notifications_sent_total",
    "Total notifications dispatched",
    ["channel_type", "status"],
)
