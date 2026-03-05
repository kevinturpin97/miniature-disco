"""
URL configuration for Greenhouse SaaS.
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from .health import detailed_health_check, health_check, readiness_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.api.urls")),
    path("api/", include("apps.iot.urls")),
    # API v1 (versioned)
    path("api/v1/", include("apps.api.urls")),
    path("api/v1/", include("apps.iot.urls")),
    # OpenAPI schema & docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # Health checks
    path("api/health/", health_check, name="health-check"),
    path("api/health/ready/", readiness_check, name="readiness-check"),
    path("api/health/detailed/", detailed_health_check, name="detailed-health-check"),
    # Prometheus metrics
    path("", include("django_prometheus.urls")),
]
