"""Admin configuration for greenhouse app."""
from django.contrib import admin
from .models import Actuator, Alert, AutomationRule, Command, Greenhouse, Sensor, SensorReading, Zone

admin.site.register(Greenhouse)
admin.site.register(Zone)
admin.site.register(Sensor)
admin.site.register(SensorReading)
admin.site.register(Actuator)
admin.site.register(Command)
admin.site.register(AutomationRule)
admin.site.register(Alert)
