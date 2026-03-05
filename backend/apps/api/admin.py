"""Django admin configuration for the API app."""

from django.contrib import admin

from .models import APIKey, APIKeyLog, Invitation, Membership, Organization, Subscription, Webhook, WebhookDelivery


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "plan", "is_on_trial", "trial_ends_at", "stripe_customer_id", "created_at")
    list_filter = ("plan",)
    search_fields = ("name", "slug", "stripe_customer_id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "joined_at")
    list_filter = ("role",)
    search_fields = ("user__username", "organization__name")
    readonly_fields = ("joined_at",)


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "organization", "role", "accepted", "expires_at", "created_at")
    list_filter = ("accepted", "role")
    search_fields = ("email", "organization__name")
    readonly_fields = ("token", "created_at")


@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ("name", "prefix", "organization", "scope", "is_active", "last_used_at", "created_at")
    list_filter = ("scope", "is_active")
    search_fields = ("name", "prefix", "organization__name")
    readonly_fields = ("prefix", "hashed_key", "last_used_at", "created_at")


@admin.register(APIKeyLog)
class APIKeyLogAdmin(admin.ModelAdmin):
    list_display = ("api_key", "method", "path", "status_code", "ip_address", "created_at")
    list_filter = ("method", "status_code")
    readonly_fields = ("api_key", "method", "path", "status_code", "ip_address", "user_agent", "created_at")


@admin.register(Webhook)
class WebhookAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "url", "is_active", "failure_count", "last_triggered_at")
    list_filter = ("is_active",)
    search_fields = ("name", "url", "organization__name")
    readonly_fields = ("last_triggered_at", "failure_count", "created_at", "updated_at")


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    list_display = ("webhook", "event_type", "status", "response_status", "duration_ms", "created_at")
    list_filter = ("status", "event_type")
    readonly_fields = ("webhook", "event_type", "payload", "response_status", "response_body", "status", "error_message", "duration_ms", "created_at")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "current_period_start", "current_period_end", "cancel_at_period_end", "created_at")
    list_filter = ("plan", "status")
    search_fields = ("organization__name", "stripe_subscription_id")
    readonly_fields = ("stripe_subscription_id", "stripe_price_id", "created_at", "updated_at")
