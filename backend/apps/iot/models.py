"""IoT app models — re-exported from dedicated apps for backward compatibility.

The canonical implementations live in:
- apps.greenhouse: Greenhouse, Zone, Sensor, SensorReading, Actuator, Command, AutomationRule, Alert
- apps.notifications: NotificationChannel, NotificationRule, NotificationLog, PushSubscription
- apps.schedules: Scenario, ScenarioStep, Schedule
- apps.analytics: SensorReadingHourly, SensorReadingDaily, RetentionPolicy, DataArchiveLog,
                  AuditEvent, MLModel, SensorPrediction, AnomalyRecord, SmartSuggestion
- apps.marketplace: TemplateCategory, Template, TemplateRating
- apps.sites: Site, WeatherData, WeatherAlert
- apps.compliance: CropCycle, Note, CultureLog, TraceabilityReport
- apps.crop: CropStatus, CropIndicatorPreference
- apps.fleet: EdgeDevice, SyncBatch, FirmwareRelease, DeviceOTAJob, DeviceMetrics

This module re-exports them to avoid breaking existing imports during migration.
"""

from apps.analytics.models import (  # noqa: F401
    AnomalyRecord,
    AuditEvent,
    DataArchiveLog,
    MLModel,
    RetentionPolicy,
    SensorPrediction,
    SensorReadingDaily,
    SensorReadingHourly,
    SmartSuggestion,
)
from apps.compliance.models import CropCycle, CultureLog, Note, TraceabilityReport  # noqa: F401
from apps.crop.models import CropIndicatorPreference, CropStatus  # noqa: F401
from apps.fleet.models import (  # noqa: F401
    DeviceMetrics,
    DeviceOTAJob,
    EdgeDevice,
    FirmwareRelease,
    SyncBatch,
)
from apps.greenhouse.models import (  # noqa: F401
    Actuator,
    Alert,
    AutomationRule,
    Command,
    Greenhouse,
    Sensor,
    SensorReading,
    Zone,
)
from apps.marketplace.models import Template, TemplateCategory, TemplateRating  # noqa: F401
from apps.notifications.models import (  # noqa: F401
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    PushSubscription,
)
from apps.schedules.models import Scenario, ScenarioStep, Schedule  # noqa: F401
from apps.sites.models import Site, WeatherAlert, WeatherData  # noqa: F401
