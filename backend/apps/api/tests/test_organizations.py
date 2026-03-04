"""Tests for multi-tenancy: Organizations, Memberships, Invitations, Quotas."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.api.models import Invitation, Membership, Organization
from apps.iot.models import Greenhouse, Zone
from conftest import (
    GreenhouseFactory,
    MembershipFactory,
    OrganizationFactory,
    UserFactory,
    ZoneFactory,
)


def _auth_client(user):
    """Return an APIClient authenticated as the given user."""
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


# ---------------------------------------------------------------------------
# Organization CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOrganizationListCreate:
    """GET / POST /api/orgs/"""

    url = "/api/orgs/"

    def test_list_returns_user_orgs(self, auth_client, user):
        response = auth_client.get(self.url)
        assert response.status_code == 200
        results = response.data["results"] if "results" in response.data else response.data
        slugs = [o["slug"] for o in results]
        # user fixture creates one personal org
        assert len(slugs) == 1

    def test_list_does_not_include_other_orgs(self, auth_client, user, other_user):
        response = auth_client.get(self.url)
        results = response.data["results"] if "results" in response.data else response.data
        assert len(results) == 1  # only user's own org

    def test_create_org(self, auth_client, user):
        response = auth_client.post(self.url, {"name": "My New Org"})
        assert response.status_code == 201
        assert response.data["name"] == "My New Org"
        # user is OWNER of the new org
        assert Membership.objects.filter(
            user=user,
            organization__name="My New Org",
            role=Membership.Role.OWNER,
        ).exists()

    def test_create_org_unauthenticated(self, api_client):
        response = api_client.post(self.url, {"name": "Nope"})
        assert response.status_code == 401


@pytest.mark.django_db
class TestOrganizationDetail:
    """GET / PATCH /api/orgs/{slug}/"""

    def _url(self, slug):
        return f"/api/orgs/{slug}/"

    def test_retrieve_own_org(self, auth_client, user):
        org = Membership.objects.get(user=user).organization
        response = auth_client.get(self._url(org.slug))
        assert response.status_code == 200
        assert response.data["slug"] == org.slug

    def test_retrieve_other_org_denied(self, auth_client, other_user):
        org = Membership.objects.get(user=other_user).organization
        response = auth_client.get(self._url(org.slug))
        assert response.status_code == 404

    def test_patch_org_name(self, auth_client, user):
        org = Membership.objects.get(user=user).organization
        response = auth_client.patch(self._url(org.slug), {"name": "Renamed Org"})
        assert response.status_code == 200
        assert response.data["name"] == "Renamed Org"


# ---------------------------------------------------------------------------
# Membership management
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestMemberManagement:
    """GET / PATCH / DELETE /api/orgs/{slug}/members/{id}/"""

    def test_list_members(self, auth_client, user):
        org = Membership.objects.get(user=user).organization
        response = auth_client.get(f"/api/orgs/{org.slug}/members/")
        assert response.status_code == 200
        results = response.data["results"] if "results" in response.data else response.data
        assert len(results) == 1
        assert results[0]["username"] == user.username

    def test_admin_can_change_member_role(self, user):
        org = Membership.objects.get(user=user).organization
        # Add a second member as VIEWER
        viewer = UserFactory()
        MembershipFactory(user=viewer, organization=org, role=Membership.Role.VIEWER)
        # Promote user to ADMIN (they are already OWNER, so they can change roles)
        client = _auth_client(user)
        viewer_membership = Membership.objects.get(user=viewer, organization=org)
        response = client.patch(
            f"/api/orgs/{org.slug}/members/{viewer_membership.pk}/",
            {"role": Membership.Role.OPERATOR},
        )
        assert response.status_code == 200
        viewer_membership.refresh_from_db()
        assert viewer_membership.role == Membership.Role.OPERATOR

    def test_viewer_cannot_change_role(self, user):
        org = Membership.objects.get(user=user).organization
        viewer = UserFactory()
        MembershipFactory(user=viewer, organization=org, role=Membership.Role.VIEWER)
        operator = UserFactory()
        MembershipFactory(user=operator, organization=org, role=Membership.Role.OPERATOR)
        # viewer tries to change operator's role
        client = _auth_client(viewer)
        op_membership = Membership.objects.get(user=operator, organization=org)
        response = client.patch(
            f"/api/orgs/{org.slug}/members/{op_membership.pk}/",
            {"role": Membership.Role.ADMIN},
        )
        assert response.status_code == 403

    def test_cannot_change_owner_role(self, user):
        org = Membership.objects.get(user=user).organization
        admin = UserFactory()
        MembershipFactory(user=admin, organization=org, role=Membership.Role.ADMIN)
        client = _auth_client(admin)
        owner_membership = Membership.objects.get(user=user, organization=org)
        response = client.patch(
            f"/api/orgs/{org.slug}/members/{owner_membership.pk}/",
            {"role": Membership.Role.VIEWER},
        )
        assert response.status_code == 403

    def test_cannot_remove_owner(self, user):
        org = Membership.objects.get(user=user).organization
        admin = UserFactory()
        MembershipFactory(user=admin, organization=org, role=Membership.Role.ADMIN)
        client = _auth_client(admin)
        owner_membership = Membership.objects.get(user=user, organization=org)
        response = client.delete(f"/api/orgs/{org.slug}/members/{owner_membership.pk}/")
        assert response.status_code == 403

    def test_admin_can_remove_viewer(self, user):
        org = Membership.objects.get(user=user).organization
        viewer = UserFactory()
        MembershipFactory(user=viewer, organization=org, role=Membership.Role.VIEWER)
        client = _auth_client(user)
        viewer_membership = Membership.objects.get(user=viewer, organization=org)
        response = client.delete(f"/api/orgs/{org.slug}/members/{viewer_membership.pk}/")
        assert response.status_code == 204
        assert not Membership.objects.filter(user=viewer, organization=org).exists()


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInvitations:
    """POST /api/orgs/{slug}/invite/, POST /api/invitations/{token}/accept/"""

    def test_admin_can_invite(self, user):
        org = Membership.objects.get(user=user).organization
        client = _auth_client(user)
        response = client.post(
            f"/api/orgs/{org.slug}/invite/",
            {"email": "newmember@example.com", "role": Membership.Role.OPERATOR},
        )
        assert response.status_code == 201
        assert Invitation.objects.filter(
            organization=org, email="newmember@example.com"
        ).exists()

    def test_viewer_cannot_invite(self, user):
        org = Membership.objects.get(user=user).organization
        viewer = UserFactory()
        MembershipFactory(user=viewer, organization=org, role=Membership.Role.VIEWER)
        client = _auth_client(viewer)
        response = client.post(
            f"/api/orgs/{org.slug}/invite/",
            {"email": "someone@example.com"},
        )
        assert response.status_code == 403

    def test_cannot_invite_as_owner(self, user):
        org = Membership.objects.get(user=user).organization
        client = _auth_client(user)
        response = client.post(
            f"/api/orgs/{org.slug}/invite/",
            {"email": "someone@example.com", "role": Membership.Role.OWNER},
        )
        assert response.status_code == 400

    def test_accept_invitation_success(self, user):
        org = Membership.objects.get(user=user).organization
        invitee = UserFactory()
        invitation = Invitation.objects.create(
            organization=org,
            email=invitee.email,
            role=Membership.Role.OPERATOR,
            invited_by=user,
            expires_at=timezone.now() + timedelta(hours=48),
        )
        client = _auth_client(invitee)
        response = client.post(f"/api/invitations/{invitation.token}/accept/")
        assert response.status_code == 200
        assert Membership.objects.filter(
            user=invitee, organization=org, role=Membership.Role.OPERATOR
        ).exists()
        invitation.refresh_from_db()
        assert invitation.accepted is True

    def test_accept_expired_invitation(self, user):
        org = Membership.objects.get(user=user).organization
        invitee = UserFactory()
        invitation = Invitation.objects.create(
            organization=org,
            email=invitee.email,
            role=Membership.Role.VIEWER,
            invited_by=user,
            expires_at=timezone.now() - timedelta(hours=1),  # expired
        )
        client = _auth_client(invitee)
        response = client.post(f"/api/invitations/{invitation.token}/accept/")
        assert response.status_code == 400
        assert "expired" in response.data["detail"].lower()

    def test_accept_invitation_wrong_email(self, user):
        org = Membership.objects.get(user=user).organization
        invitee = UserFactory()
        invitation = Invitation.objects.create(
            organization=org,
            email="different@example.com",
            role=Membership.Role.VIEWER,
            invited_by=user,
            expires_at=timezone.now() + timedelta(hours=48),
        )
        client = _auth_client(invitee)
        response = client.post(f"/api/invitations/{invitation.token}/accept/")
        assert response.status_code == 403

    def test_accept_already_accepted_invitation(self, user):
        org = Membership.objects.get(user=user).organization
        invitee = UserFactory()
        invitation = Invitation.objects.create(
            organization=org,
            email=invitee.email,
            role=Membership.Role.VIEWER,
            invited_by=user,
            expires_at=timezone.now() + timedelta(hours=48),
            accepted=True,
        )
        client = _auth_client(invitee)
        response = client.post(f"/api/invitations/{invitation.token}/accept/")
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Cross-org isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCrossOrgIsolation:
    """Verify users cannot access resources from other organizations."""

    def test_greenhouse_list_only_own_org(self, user, other_user):
        GreenhouseFactory(owner=user)
        GreenhouseFactory(owner=other_user)
        client = _auth_client(user)
        response = client.get("/api/greenhouses/")
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_zone_list_other_org_denied(self, user, other_user):
        gh = GreenhouseFactory(owner=other_user)
        ZoneFactory(greenhouse=gh)
        client = _auth_client(user)
        response = client.get(f"/api/greenhouses/{gh.pk}/zones/")
        assert response.status_code == 404

    def test_greenhouse_detail_other_org_denied(self, user, other_user):
        gh = GreenhouseFactory(owner=other_user)
        client = _auth_client(user)
        response = client.get(f"/api/greenhouses/{gh.pk}/")
        assert response.status_code == 404

    def test_shared_org_member_can_see_greenhouse(self, user, other_user):
        """A member added to the same org should see its greenhouses."""
        org = Membership.objects.get(user=user).organization
        MembershipFactory(user=other_user, organization=org, role=Membership.Role.VIEWER)
        GreenhouseFactory(owner=user, organization=org)
        client = _auth_client(other_user)
        response = client.get("/api/greenhouses/")
        assert response.status_code == 200
        # other_user can see both: their own org greenhouses + shared org
        # The greenhouse is in user's org which other_user just joined
        own_org = Membership.objects.filter(
            user=other_user, role=Membership.Role.OWNER
        ).first().organization
        shared_count = Greenhouse.objects.filter(
            organization__memberships__user=other_user
        ).distinct().count()
        assert response.data["count"] == shared_count


# ---------------------------------------------------------------------------
# Quota enforcement
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestQuotaEnforcement:
    """Verify plan-based quotas are enforced on greenhouse and zone creation."""

    def test_greenhouse_quota_free_plan(self, user):
        """FREE plan allows max 3 greenhouses."""
        org = Membership.objects.get(user=user).organization
        org.plan = Organization.Plan.FREE
        org.save()
        # Create greenhouses up to the limit
        limit = Organization.PLAN_LIMITS[Organization.Plan.FREE]["max_greenhouses"]
        for i in range(limit):
            GreenhouseFactory(owner=user, organization=org, name=f"GH {i}")
        # Next one should fail
        client = _auth_client(user)
        response = client.post("/api/greenhouses/", {"name": "Over Limit"})
        assert response.status_code == 400
        assert "limit" in str(response.data).lower()

    def test_greenhouse_quota_pro_plan(self, user):
        """PRO plan allows more greenhouses."""
        org = Membership.objects.get(user=user).organization
        org.plan = Organization.Plan.PRO
        org.save()
        limit_pro = Organization.PLAN_LIMITS[Organization.Plan.PRO]["max_greenhouses"]
        limit_free = Organization.PLAN_LIMITS[Organization.Plan.FREE]["max_greenhouses"]
        # Create up to FREE limit — should still be under PRO limit
        for i in range(limit_free):
            GreenhouseFactory(owner=user, organization=org, name=f"GH {i}")
        client = _auth_client(user)
        response = client.post("/api/greenhouses/", {"name": "Still OK"})
        assert response.status_code == 201

    def test_zone_quota_free_plan(self, user):
        """FREE plan enforces zone limit across the organization."""
        org = Membership.objects.get(user=user).organization
        org.plan = Organization.Plan.FREE
        org.save()
        gh = GreenhouseFactory(owner=user, organization=org)
        limit = Organization.PLAN_LIMITS[Organization.Plan.FREE]["max_zones"]
        for i in range(limit):
            ZoneFactory(greenhouse=gh, name=f"Zone {i}")
        client = _auth_client(user)
        response = client.post(
            f"/api/greenhouses/{gh.pk}/zones/",
            {"name": "Over Limit Zone", "relay_id": 200, "transmission_interval": 300},
        )
        assert response.status_code == 400
        assert "limit" in str(response.data).lower()


# ---------------------------------------------------------------------------
# Registration auto-creates organization
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRegistrationAutoOrg:
    """Verify that registering a new user auto-creates a personal organization."""

    url = "/api/auth/register/"

    def test_register_creates_org_and_membership(self, api_client):
        payload = {
            "username": "orgtest",
            "email": "orgtest@example.com",
            "password": "StrongPass123!",
            "password2": "StrongPass123!",
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 201
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(username="orgtest")
        membership = Membership.objects.filter(user=user, role=Membership.Role.OWNER).first()
        assert membership is not None
        assert membership.organization.name == "orgtest's Organization"
