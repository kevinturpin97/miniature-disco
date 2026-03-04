"""
URL configuration for Greenhouse SaaS.
"""

from django.contrib import admin
from django.urls import include, path

from .health import detailed_health_check, health_check, readiness_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.api.urls")),
    path("api/", include("apps.iot.urls")),
    path("api/health/", health_check, name="health-check"),
    path("api/health/ready/", readiness_check, name="readiness-check"),
    path("api/health/detailed/", detailed_health_check, name="detailed-health-check"),
    # Prometheus metrics
    path("", include("django_prometheus.urls")),
]
