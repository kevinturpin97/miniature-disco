"""Legacy stub — all models have been moved to dedicated apps.

This file is intentionally empty. Import directly from the appropriate app:

    from apps.greenhouse.models import Greenhouse, Zone, Sensor, SensorReading, Actuator, Command, AutomationRule, Alert
    from apps.notifications.models import NotificationChannel, NotificationRule, NotificationLog, PushSubscription
    from apps.schedules.models import Scenario, ScenarioStep, Schedule
    from apps.analytics.models import SensorReadingHourly, SensorReadingDaily, AuditEvent, MLModel, SensorPrediction, AnomalyRecord, SmartSuggestion, RetentionPolicy, DataArchiveLog
    from apps.marketplace.models import TemplateCategory, Template, TemplateRating
    from apps.sites.models import Site, WeatherData, WeatherAlert
    from apps.compliance.models import CropCycle, Note, CultureLog, TraceabilityReport
    from apps.crop.models import CropStatus, CropIndicatorPreference
    from apps.fleet.models import EdgeDevice, SyncBatch, FirmwareRelease, DeviceOTAJob, DeviceMetrics
"""
