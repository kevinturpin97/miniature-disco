"""Admin configuration for developer app."""
from django.contrib import admin
from .models import APIKey, APIKeyLog, Webhook, WebhookDelivery

@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ["name", "prefix", "scope", "is_active", "created_at"]

@admin.register(Webhook)
class WebhookAdmin(admin.ModelAdmin):
    list_display = ["name", "url", "is_active", "created_at"]

admin.site.register(APIKeyLog)
admin.site.register(WebhookDelivery)
