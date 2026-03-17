"""Admin configuration for sites app."""
from django.contrib import admin
from .models import Site, WeatherAlert, WeatherData

admin.site.register(Site)
admin.site.register(WeatherData)
admin.site.register(WeatherAlert)
