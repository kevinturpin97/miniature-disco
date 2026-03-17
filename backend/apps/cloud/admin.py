"""Admin configuration for cloud app."""
from django.contrib import admin
from .models import CloudTenant, ImpersonationToken

@admin.register(CloudTenant)
class CloudTenantAdmin(admin.ModelAdmin):
    list_display = ["organization", "cloud_storage_mb", "last_activity", "is_active"]

admin.site.register(ImpersonationToken)
