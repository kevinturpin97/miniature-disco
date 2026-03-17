"""Admin configuration for compliance app."""
from django.contrib import admin
from .models import CropCycle, CultureLog, Note, TraceabilityReport

admin.site.register(CropCycle)
admin.site.register(Note)
admin.site.register(CultureLog)
admin.site.register(TraceabilityReport)
