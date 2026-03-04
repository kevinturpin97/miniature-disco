"""URL configuration for authentication, organization, and invitation endpoints."""

from django.urls import path

from .views import (
    AcceptInvitationView,
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
]
