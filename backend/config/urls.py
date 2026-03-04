"""
URL configuration for Greenhouse SaaS.
"""

from django.contrib import admin
from django.urls import include, path

from .health import health_check, readiness_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.api.urls")),
    path("api/", include("apps.iot.urls")),
    path("api/health/", health_check, name="health-check"),
    path("api/health/ready/", readiness_check, name="readiness-check"),
]
