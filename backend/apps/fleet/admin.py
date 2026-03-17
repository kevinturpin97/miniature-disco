"""Admin configuration for fleet app."""
from django.contrib import admin
from .models import DeviceMetrics, DeviceOTAJob, EdgeDevice, FirmwareRelease, SyncBatch

admin.site.register(EdgeDevice)
admin.site.register(SyncBatch)
admin.site.register(FirmwareRelease)
admin.site.register(DeviceOTAJob)
admin.site.register(DeviceMetrics)
