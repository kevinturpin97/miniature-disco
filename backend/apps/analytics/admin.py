"""Admin configuration for analytics app."""
from django.contrib import admin
from .models import AnomalyRecord, AuditEvent, DataArchiveLog, MLModel, RetentionPolicy, SensorPrediction, SensorReadingDaily, SensorReadingHourly, SmartSuggestion

admin.site.register(SensorReadingHourly)
admin.site.register(SensorReadingDaily)
admin.site.register(RetentionPolicy)
admin.site.register(DataArchiveLog)
admin.site.register(AuditEvent)
admin.site.register(MLModel)
admin.site.register(SensorPrediction)
admin.site.register(AnomalyRecord)
admin.site.register(SmartSuggestion)
