"""Django admin configuration for the API app."""

from django.contrib import admin

from .models import Invitation, Membership, Organization


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "plan", "created_at")
    list_filter = ("plan",)
    search_fields = ("name", "slug")
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
