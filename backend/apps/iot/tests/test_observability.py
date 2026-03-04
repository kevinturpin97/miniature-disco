"""Tests for Sprint 18 — Observability & Production Hardening.

Covers:
    - Enriched health check endpoints (liveness, readiness, detailed)
    - AuditEvent model and audit helper
    - Structured logging configuration
    - Prometheus custom metrics
    - CSP & audit middleware
"""

from unittest.mock import MagicMock, patch

import pytest
from django.test import RequestFactory, override_settings
from django.contrib.auth import get_user_model

from apps.iot.models import AuditEvent
from conftest import UserFactory, GreenhouseFactory, ZoneFactory
from utils.audit import create_audit_event

User = get_user_model()


# ---------------------------------------------------------------------------
# Health check endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHealthCheckEndpoints:
    """Tests for /api/health/, /api/health/ready/, /api/health/detailed/."""

    def test_liveness_returns_200(self, client):
        """Liveness probe always returns 200 with status ok."""
        response = client.get("/api/health/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    @patch("config.health.Redis")
    def test_readiness_check_database_ok(self, mock_redis_cls, client):
        """Readiness check reports database as healthy."""
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis_cls.from_url.return_value = mock_redis

        response = client.get("/api/health/ready/")
        data = response.json()
        assert data["checks"]["database"] is True

    @patch("config.health.Redis")
    def test_readiness_check_redis_ok(self, mock_redis_cls, client):
        """Readiness check reports Redis as healthy when reachable."""
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis_cls.from_url.return_value = mock_redis

        response = client.get("/api/health/ready/")
        data = response.json()
        assert data["checks"]["redis"] is True

    @patch("config.health.Redis")
    def test_readiness_check_redis_down(self, mock_redis_cls, client):
        """Readiness returns 503 when Redis is down."""
        mock_redis_cls.from_url.side_effect = ConnectionError("Redis down")

        response = client.get("/api/health/ready/")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert data["checks"]["redis"] is False

    @patch("config.health.Redis")
    def test_readiness_check_has_mqtt_key(self, mock_redis_cls, client):
        """Readiness check includes MQTT status."""
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis_cls.from_url.return_value = mock_redis

        response = client.get("/api/health/ready/")
        data = response.json()
        assert "mqtt" in data["checks"]

    @patch("config.health.Redis")
    def test_readiness_check_has_celery_key(self, mock_redis_cls, client):
        """Readiness check includes Celery status."""
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis_cls.from_url.return_value = mock_redis

        response = client.get("/api/health/ready/")
        data = response.json()
        assert "celery" in data["checks"]

    @patch("config.health.Redis")
    def test_detailed_health_returns_uptime(self, mock_redis_cls, client):
        """Detailed health check includes uptime and started_at."""
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis.info.return_value = {"used_memory": 1024 * 1024}
        mock_redis_cls.from_url.return_value = mock_redis

        response = client.get("/api/health/detailed/")
        data = response.json()
        assert "uptime_seconds" in data
        assert "started_at" in data
        assert "checks" in data

    @patch("config.health.Redis")
    def test_detailed_health_includes_response_times(self, mock_redis_cls, client):
        """Detailed health returns response_time_ms for database."""
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis.info.return_value = {"used_memory": 1024 * 1024}
        mock_redis_cls.from_url.return_value = mock_redis

        response = client.get("/api/health/detailed/")
        data = response.json()
        assert "response_time_ms" in data["checks"]["database"]


# ---------------------------------------------------------------------------
# AuditEvent model tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditEventModel:
    """Tests for the AuditEvent model."""

    def test_create_audit_event(self, user):
        """AuditEvent can be created with all required fields."""
        event = AuditEvent.objects.create(
            user=user,
            action=AuditEvent.Action.CREATE,
            resource_type="Greenhouse",
            resource_id=1,
            description="Created greenhouse Test",
        )
        assert event.pk is not None
        assert event.action == "CREATE"
        assert event.resource_type == "Greenhouse"
        assert event.resource_id == 1
        assert event.created_at is not None

    def test_audit_event_str(self, user):
        """AuditEvent __str__ includes action, user, and resource."""
        event = AuditEvent.objects.create(
            user=user,
            action=AuditEvent.Action.UPDATE,
            resource_type="Zone",
            resource_id=42,
        )
        s = str(event)
        assert "UPDATE" in s
        assert user.username in s
        assert "Zone" in s
        assert "42" in s

    def test_audit_event_without_user(self):
        """AuditEvent can be created without a user (system action)."""
        event = AuditEvent.objects.create(
            action=AuditEvent.Action.COMMAND,
            resource_type="Actuator",
            resource_id=5,
            description="Automated command sent",
        )
        s = str(event)
        assert "system" in s

    def test_audit_event_with_changes_json(self, user):
        """AuditEvent stores changed fields as JSON."""
        changes = {
            "name": {"old": "Zone A", "new": "Zone B"},
            "is_active": {"old": True, "new": False},
        }
        event = AuditEvent.objects.create(
            user=user,
            action=AuditEvent.Action.UPDATE,
            resource_type="Zone",
            resource_id=1,
            changes=changes,
        )
        event.refresh_from_db()
        assert event.changes["name"]["old"] == "Zone A"
        assert event.changes["name"]["new"] == "Zone B"

    def test_audit_event_choices(self):
        """All AuditEvent action choices are valid."""
        actions = [choice[0] for choice in AuditEvent.Action.choices]
        assert "CREATE" in actions
        assert "UPDATE" in actions
        assert "DELETE" in actions
        assert "LOGIN" in actions
        assert "LOGOUT" in actions
        assert "COMMAND" in actions
        assert "EXPORT" in actions

    def test_audit_event_ordering(self, user):
        """AuditEvents are ordered by -created_at by default."""
        e1 = AuditEvent.objects.create(
            user=user, action="CREATE", resource_type="A", resource_id=1
        )
        e2 = AuditEvent.objects.create(
            user=user, action="UPDATE", resource_type="B", resource_id=2
        )
        events = list(AuditEvent.objects.all())
        assert events[0].pk == e2.pk
        assert events[1].pk == e1.pk


# ---------------------------------------------------------------------------
# Audit helper tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuditHelper:
    """Tests for the create_audit_event utility function."""

    def test_create_audit_event_basic(self, user):
        """create_audit_event creates a valid AuditEvent."""
        event = create_audit_event(
            user=user,
            action=AuditEvent.Action.CREATE,
            resource_type="Greenhouse",
            resource_id=10,
            description="Created a greenhouse",
        )
        assert event.pk is not None
        assert event.user == user
        assert AuditEvent.objects.count() == 1

    def test_create_audit_event_with_request(self, user):
        """create_audit_event extracts IP and user-agent from request."""
        factory = RequestFactory()
        request = factory.post("/api/greenhouses/")
        request.user = user
        request.META["REMOTE_ADDR"] = "192.168.1.100"
        request.META["HTTP_USER_AGENT"] = "TestAgent/1.0"

        event = create_audit_event(
            user=user,
            action=AuditEvent.Action.CREATE,
            resource_type="Greenhouse",
            resource_id=1,
            request=request,
        )
        assert event.ip_address == "192.168.1.100"
        assert event.user_agent == "TestAgent/1.0"

    def test_create_audit_event_with_changes(self, user):
        """create_audit_event stores changes dict correctly."""
        changes = {"name": {"old": "A", "new": "B"}}
        event = create_audit_event(
            user=user,
            action=AuditEvent.Action.UPDATE,
            resource_type="Zone",
            resource_id=5,
            changes=changes,
        )
        assert event.changes == changes

    def test_create_audit_event_system_action(self):
        """create_audit_event works without a user (system action)."""
        event = create_audit_event(
            action=AuditEvent.Action.COMMAND,
            resource_type="Actuator",
            resource_id=3,
            description="Automation triggered",
        )
        assert event.user is None
        assert event.pk is not None


# ---------------------------------------------------------------------------
# Middleware tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestMiddleware:
    """Tests for CSP and audit logging middleware."""

    @override_settings(DEBUG=False, CSP_DEFAULT_SRC="'self'", CSP_SCRIPT_SRC="'self'")
    def test_csp_header_in_production(self, client):
        """CSP header is set in production mode."""
        response = client.get("/api/health/")
        csp = response.get("Content-Security-Policy", "")
        assert "default-src" in csp

    @override_settings(DEBUG=True)
    def test_no_csp_header_in_debug(self, client):
        """CSP header is not set in debug mode."""
        response = client.get("/api/health/")
        csp = response.get("Content-Security-Policy")
        assert csp is None

    def test_audit_middleware_logs_post(self, auth_client, greenhouse):
        """Audit middleware logs POST requests to /api/."""
        with patch("utils.middleware.logger") as mock_logger:
            auth_client.post(
                f"/api/greenhouses/{greenhouse.pk}/zones/",
                data={
                    "name": "Test Zone",
                    "relay_id": 200,
                    "description": "test",
                    "transmission_interval": 300,
                },
                format="json",
            )
            # Check that logger.info was called with api_audit event
            calls = [c for c in mock_logger.info.call_args_list if c[0][0] == "api_audit"]
            assert len(calls) >= 1

    def test_audit_middleware_ignores_get(self, auth_client):
        """Audit middleware does not log GET requests."""
        with patch("utils.middleware.logger") as mock_logger:
            auth_client.get("/api/health/")
            calls = [c for c in mock_logger.info.call_args_list if c[0] and c[0][0] == "api_audit"]
            assert len(calls) == 0


# ---------------------------------------------------------------------------
# Structured logging tests
# ---------------------------------------------------------------------------


class TestStructuredLogging:
    """Tests for the structlog configuration."""

    def test_configure_structlog_debug(self):
        """configure_structlog in debug mode does not raise."""
        from utils.logging import configure_structlog
        configure_structlog(debug=True)

    def test_configure_structlog_production(self):
        """configure_structlog in production mode does not raise."""
        from utils.logging import configure_structlog
        configure_structlog(debug=False)

    def test_get_logging_config_debug(self):
        """get_logging_config returns valid dict for debug mode."""
        from utils.logging import get_logging_config
        config = get_logging_config(debug=True)
        assert config["version"] == 1
        assert "structlog" in config["formatters"]
        assert "console" in config["handlers"]

    def test_get_logging_config_production(self):
        """get_logging_config returns valid dict for production mode."""
        from utils.logging import get_logging_config
        config = get_logging_config(debug=False)
        assert config["version"] == 1
        assert config["root"]["level"] == "INFO"

    def test_logging_config_has_app_loggers(self):
        """Logging config includes app-specific loggers."""
        from utils.logging import get_logging_config
        config = get_logging_config(debug=False)
        assert "apps.iot" in config["loggers"]
        assert "apps.api" in config["loggers"]
        assert "celery" in config["loggers"]


# ---------------------------------------------------------------------------
# Prometheus metrics tests
# ---------------------------------------------------------------------------


class TestPrometheusMetrics:
    """Tests for custom Prometheus metrics definitions."""

    def test_sensor_readings_counter_exists(self):
        """SENSOR_READINGS_TOTAL counter is defined."""
        from utils.metrics import SENSOR_READINGS_TOTAL
        assert SENSOR_READINGS_TOTAL._name == "greenhouse_sensor_readings"

    def test_commands_counter_exists(self):
        """COMMANDS_TOTAL counter is defined."""
        from utils.metrics import COMMANDS_TOTAL
        assert COMMANDS_TOTAL._name == "greenhouse_commands"

    def test_active_alerts_gauge_exists(self):
        """ACTIVE_ALERTS gauge is defined."""
        from utils.metrics import ACTIVE_ALERTS
        assert ACTIVE_ALERTS._name == "greenhouse_active_alerts"

    def test_websocket_connections_gauge_exists(self):
        """WEBSOCKET_CONNECTIONS gauge is defined."""
        from utils.metrics import WEBSOCKET_CONNECTIONS
        assert WEBSOCKET_CONNECTIONS._name == "greenhouse_websocket_connections"

    def test_api_request_duration_histogram_exists(self):
        """API_REQUEST_DURATION histogram is defined."""
        from utils.metrics import API_REQUEST_DURATION
        assert API_REQUEST_DURATION._name == "greenhouse_api_request_duration_seconds"

    def test_notifications_counter_exists(self):
        """NOTIFICATIONS_SENT_TOTAL counter is defined."""
        from utils.metrics import NOTIFICATIONS_SENT_TOTAL
        assert NOTIFICATIONS_SENT_TOTAL._name == "greenhouse_notifications_sent"

    def test_mqtt_messages_counter_exists(self):
        """MQTT_MESSAGES_TOTAL counter is defined."""
        from utils.metrics import MQTT_MESSAGES_TOTAL
        assert MQTT_MESSAGES_TOTAL._name == "greenhouse_mqtt_messages"

    def test_sensor_reading_counter_increment(self):
        """SENSOR_READINGS_TOTAL can be incremented."""
        from utils.metrics import SENSOR_READINGS_TOTAL
        SENSOR_READINGS_TOTAL.labels(sensor_type="TEMP", zone_id="1").inc()

    def test_commands_counter_increment(self):
        """COMMANDS_TOTAL can be incremented."""
        from utils.metrics import COMMANDS_TOTAL
        COMMANDS_TOTAL.labels(command_type="ON", status="SENT").inc()


# ---------------------------------------------------------------------------
# Prometheus endpoint test
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPrometheusEndpoint:
    """Test the /metrics endpoint is accessible."""

    def test_metrics_endpoint_returns_200(self, client):
        """Prometheus metrics endpoint returns 200."""
        response = client.get("/metrics")
        assert response.status_code == 200
        content = response.content.decode()
        assert "django_http" in content or "process_" in content
