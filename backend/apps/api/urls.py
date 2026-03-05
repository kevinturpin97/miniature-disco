"""URL configuration for authentication, organization, invitation, and billing endpoints."""

from django.urls import path

from .billing_views import (
    BillingOverviewView,
    CreateCheckoutSessionView,
    CustomerPortalView,
    StripeWebhookView,
)
from .cloud_views import (
    CRMImpersonateView,
    CRMStatsView,
    CRMTenantDetailView,
    CRMTenantExportCSVView,
    CRMTenantListView,
    CRMTenantHealthView,
    EdgeConfigView,
    EdgeRegisterView,
    EdgeSyncView,
)
from .views import (
    AcceptInvitationView,
    APIKeyLogViewSet,
    APIKeyViewSet,
    ChangePasswordView,
    InviteView,
    LoginView,
    LogoutView,
    MeView,
    MemberDetailView,
    MemberListView,
    OrganizationDetailView,
    OrganizationListCreateView,
    RefreshView,
    RegisterView,
    SandboxInfoView,
    WebhookDeliveryViewSet,
    WebhookViewSet,
)

urlpatterns = [
    # Auth
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    # Organizations
    path("orgs/", OrganizationListCreateView.as_view(), name="org-list-create"),
    path("orgs/<slug:slug>/", OrganizationDetailView.as_view(), name="org-detail"),
    path("orgs/<slug:slug>/members/", MemberListView.as_view(), name="org-member-list"),
    path("orgs/<slug:slug>/members/<int:pk>/", MemberDetailView.as_view(), name="org-member-detail"),
    path("orgs/<slug:slug>/invite/", InviteView.as_view(), name="org-invite"),
    # Invitations
    path("invitations/<str:token>/accept/", AcceptInvitationView.as_view(), name="invitation-accept"),
    # API Keys (per org)
    path("orgs/<slug:slug>/api-keys/", APIKeyViewSet.as_view({"get": "list", "post": "create_key"}), name="api-key-list"),
    path("orgs/<slug:slug>/api-keys/<int:pk>/", APIKeyViewSet.as_view({"get": "retrieve", "delete": "destroy"}), name="api-key-detail"),
    path("orgs/<slug:slug>/api-keys/<int:pk>/revoke/", APIKeyViewSet.as_view({"post": "revoke"}), name="api-key-revoke"),
    # API Key Logs (per org)
    path("orgs/<slug:slug>/api-keys/logs/", APIKeyLogViewSet.as_view({"get": "list"}), name="api-key-log-list"),
    # Webhooks (per org)
    path("orgs/<slug:slug>/webhooks/", WebhookViewSet.as_view({"get": "list", "post": "create"}), name="webhook-list"),
    path("orgs/<slug:slug>/webhooks/<int:pk>/", WebhookViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}), name="webhook-detail"),
    # Webhook Deliveries (per org)
    path("orgs/<slug:slug>/webhooks/deliveries/", WebhookDeliveryViewSet.as_view({"get": "list"}), name="webhook-delivery-list"),
    # Billing (Sprint 22)
    path("orgs/<slug:slug>/billing/", BillingOverviewView.as_view(), name="billing-overview"),
    path("orgs/<slug:slug>/billing/checkout/", CreateCheckoutSessionView.as_view(), name="billing-checkout"),
    path("orgs/<slug:slug>/billing/portal/", CustomerPortalView.as_view(), name="billing-portal"),
    # Stripe Webhook (no auth — verified by Stripe signature)
    path("webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
    # Sandbox
    path("developer/sandbox/", SandboxInfoView.as_view(), name="developer-sandbox"),
    # Sprint 28 — Edge endpoints (HMAC auth, no JWT)
    path("edge/register/", EdgeRegisterView.as_view(), name="edge-register"),
    path("edge/sync/", EdgeSyncView.as_view(), name="edge-sync"),
    path("edge/config/", EdgeConfigView.as_view(), name="edge-config"),
    # Sprint 28 — CRM endpoints (operator/staff only)
    path("crm/tenants/", CRMTenantListView.as_view(), name="crm-tenant-list"),
    path("crm/tenants/export/csv/", CRMTenantExportCSVView.as_view(), name="crm-tenant-export-csv"),
    path("crm/tenants/<int:tenant_id>/", CRMTenantDetailView.as_view(), name="crm-tenant-detail"),
    path("crm/tenants/<int:tenant_id>/health/", CRMTenantHealthView.as_view(), name="crm-tenant-health"),
    path("crm/tenants/<int:tenant_id>/impersonate/", CRMImpersonateView.as_view(), name="crm-tenant-impersonate"),
    path("crm/stats/", CRMStatsView.as_view(), name="crm-stats"),
]
