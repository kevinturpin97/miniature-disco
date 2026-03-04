"""Enriched health check endpoints for monitoring and container orchestration.

Provides three endpoints:
    - ``/api/health/`` — Basic liveness check (always 200 if Django is running).
    - ``/api/health/ready/`` — Readiness check (verifies DB, Redis, MQTT, Celery).
    - ``/api/health/detailed/`` — Detailed health with uptime and response times.
"""

import time
from datetime import datetime, timezone

import structlog
from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from redis import Redis

from decouple import config

logger = structlog.get_logger(__name__)

_START_TIME = time.monotonic()
_START_DATETIME = datetime.now(timezone.utc)


@require_GET
def health_check(request) -> JsonResponse:
    """Liveness probe — returns 200 if the Django process is alive."""
    return JsonResponse({"status": "ok"})


@require_GET
def readiness_check(request) -> JsonResponse:
    """Readiness probe — verifies database, Redis, MQTT, and Celery are reachable.

    Returns:
        200 with service statuses if all dependencies are healthy.
        503 with details if any dependency is unavailable.
    """
    checks: dict[str, bool] = {}

    # Database check
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = True
    except Exception as exc:
        logger.warning("readiness_check_failed", service="database", error=str(exc))
        checks["database"] = False

    # Redis check
    try:
        redis_url = config("REDIS_URL", default="redis://localhost:6379/0")
        r = Redis.from_url(redis_url, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = True
    except Exception as exc:
        logger.warning("readiness_check_failed", service="redis", error=str(exc))
        checks["redis"] = False

    # MQTT check
    try:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="healthcheck",
        )
        client.connect(
            settings.MQTT_BROKER_HOST,
            settings.MQTT_BROKER_PORT,
            keepalive=5,
        )
        client.disconnect()
        checks["mqtt"] = True
    except Exception as exc:
        logger.warning("readiness_check_failed", service="mqtt", error=str(exc))
        checks["mqtt"] = False

    # Celery check
    try:
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=2)
        ping_result = inspector.ping()
        checks["celery"] = bool(ping_result)
    except Exception as exc:
        logger.warning("readiness_check_failed", service="celery", error=str(exc))
        checks["celery"] = False

    all_healthy = all(checks.values())
    status_code = 200 if all_healthy else 503

    return JsonResponse(
        {"status": "ok" if all_healthy else "degraded", "checks": checks},
        status=status_code,
    )


@require_GET
def detailed_health_check(request) -> JsonResponse:
    """Detailed health endpoint with uptime and per-component response times.

    Returns the same checks as readiness plus timing information.
    Intended for internal dashboards and monitoring tools.
    """
    uptime_seconds = time.monotonic() - _START_TIME
    checks: dict[str, dict] = {}

    # Database
    db_start = time.monotonic()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = {
            "status": "ok",
            "response_time_ms": round((time.monotonic() - db_start) * 1000, 2),
        }
    except Exception as exc:
        checks["database"] = {"status": "error", "error": str(exc)}

    # Redis
    redis_start = time.monotonic()
    try:
        redis_url = config("REDIS_URL", default="redis://localhost:6379/0")
        r = Redis.from_url(redis_url, socket_connect_timeout=2)
        info = r.info("memory")
        checks["redis"] = {
            "status": "ok",
            "response_time_ms": round((time.monotonic() - redis_start) * 1000, 2),
            "used_memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
        }
    except Exception as exc:
        checks["redis"] = {"status": "error", "error": str(exc)}

    # MQTT
    mqtt_start = time.monotonic()
    try:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="healthcheck-detailed",
        )
        client.connect(
            settings.MQTT_BROKER_HOST,
            settings.MQTT_BROKER_PORT,
            keepalive=5,
        )
        client.disconnect()
        checks["mqtt"] = {
            "status": "ok",
            "response_time_ms": round((time.monotonic() - mqtt_start) * 1000, 2),
        }
    except Exception as exc:
        checks["mqtt"] = {"status": "error", "error": str(exc)}

    # Celery
    celery_start = time.monotonic()
    try:
        from config.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=2)
        ping_result = inspector.ping()
        worker_count = len(ping_result) if ping_result else 0
        checks["celery"] = {
            "status": "ok" if worker_count > 0 else "warning",
            "response_time_ms": round((time.monotonic() - celery_start) * 1000, 2),
            "active_workers": worker_count,
        }
    except Exception as exc:
        checks["celery"] = {"status": "error", "error": str(exc)}

    all_ok = all(c.get("status") == "ok" for c in checks.values())

    return JsonResponse(
        {
            "status": "ok" if all_ok else "degraded",
            "uptime_seconds": round(uptime_seconds, 2),
            "started_at": _START_DATETIME.isoformat(),
            "checks": checks,
        },
        status=200 if all_ok else 503,
    )
