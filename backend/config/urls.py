"""
URL configuration for Greenhouse SaaS.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.api.urls")),
    path("api/", include("apps.iot.urls")),
]
