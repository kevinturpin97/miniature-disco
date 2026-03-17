"""Admin configuration for schedules app."""
from django.contrib import admin
from .models import Scenario, ScenarioStep, Schedule

admin.site.register(Scenario)
admin.site.register(ScenarioStep)
admin.site.register(Schedule)
