"""Health check endpoints for monitoring and container orchestration.

Provides two endpoints:
    - ``/api/health/`` — Basic liveness check (always 200 if Django is running).
    - ``/api/health/ready/`` — Readiness check (verifies DB and Redis connectivity).
"""

import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from redis import Redis

from decouple import config

logger = logging.getLogger(__name__)


@require_GET
def health_check(request) -> JsonResponse:
    """Liveness probe — returns 200 if the Django process is alive."""
    return JsonResponse({"status": "ok"})


@require_GET
def readiness_check(request) -> JsonResponse:
    """Readiness probe — verifies database and Redis are reachable.

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
        logger.warning("Readiness check: database unreachable — %s", exc)
        checks["database"] = False

    # Redis check
    try:
        redis_url = config("REDIS_URL", default="redis://localhost:6379/0")
        r = Redis.from_url(redis_url, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = True
    except Exception as exc:
        logger.warning("Readiness check: redis unreachable — %s", exc)
        checks["redis"] = False

    all_healthy = all(checks.values())
    status_code = 200 if all_healthy else 503

    return JsonResponse(
        {"status": "ok" if all_healthy else "degraded", "checks": checks},
        status=status_code,
    )
