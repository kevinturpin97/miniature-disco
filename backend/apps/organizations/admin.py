"""Admin configuration for organizations app."""
from django.contrib import admin
from .models import Invitation, Membership, Organization

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "plan", "created_at"]
    search_fields = ["name", "slug"]

@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "organization", "role", "joined_at"]

@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ["email", "organization", "role", "accepted", "expires_at"]
