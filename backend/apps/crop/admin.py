"""Admin configuration for crop app."""
from django.contrib import admin
from .models import CropIndicatorPreference, CropStatus

admin.site.register(CropStatus)
admin.site.register(CropIndicatorPreference)
