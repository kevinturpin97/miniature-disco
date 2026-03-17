"""Django admin configuration for the IoT app.

All models have been moved to dedicated apps. Admin registrations are in:
- apps.greenhouse: Greenhouse, Zone, Sensor, SensorReading, Actuator, Command, AutomationRule, Alert
- apps.notifications: NotificationChannel, NotificationRule, NotificationLog, PushSubscription
- apps.schedules: Scenario, ScenarioStep, Schedule
- apps.analytics: SensorReadingHourly, SensorReadingDaily, AuditEvent, MLModel, etc.
- apps.marketplace: TemplateCategory, Template, TemplateRating
- apps.sites: Site, WeatherData, WeatherAlert
- apps.compliance: CropCycle, Note, CultureLog, TraceabilityReport
- apps.crop: CropStatus, CropIndicatorPreference
- apps.fleet: EdgeDevice, SyncBatch, FirmwareRelease, DeviceOTAJob, DeviceMetrics
"""
