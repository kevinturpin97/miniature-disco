"""URL configuration for authentication, organization, and invitation endpoints."""

from django.urls import path

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
    # Sandbox
    path("developer/sandbox/", SandboxInfoView.as_view(), name="developer-sandbox"),
]
