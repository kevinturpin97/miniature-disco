"""Tests for Sprint 21 — API Publique & Developer Platform.

Covers API key model, authentication, scope permissions, CRUD endpoints,
webhook endpoints, webhook delivery, API versioning, and sandbox.
"""

import hashlib
import hmac
import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.api.models import (
    APIKey,
    APIKeyLog,
    Membership,
    Organization,
    Webhook,
    WebhookDelivery,
)
from apps.api.tasks import deliver_webhook, dispatch_webhooks
from conftest import (
    GreenhouseFactory,
    MembershipFactory,
    OrganizationFactory,
    UserFactory,
    ZoneFactory,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _jwt_client(user) -> APIClient:
    """Return an APIClient authenticated via JWT for the given user."""
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


def _api_key_client(raw_key: str) -> APIClient:
    """Return an APIClient that authenticates via X-API-Key header."""
    client = APIClient()
    client.credentials(HTTP_X_API_KEY=raw_key)
    return client


def _create_org_with_owner(plan: str = Organization.Plan.FREE):
    """Create an organization with an OWNER user and return (org, user)."""
    user = UserFactory()
    org = OrganizationFactory(plan=plan)
    MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)
    return org, user


# ============================================================================
# 1. TestAPIKeyModel
# ============================================================================


@pytest.mark.django_db
class TestAPIKeyModel:
    """Tests for the APIKey model class methods and properties."""

    def test_create_key(self):
        """APIKey.create_key returns (instance, raw_key); raw_key starts with 'gh_' and prefix matches first 12 chars."""
        org, user = _create_org_with_owner()
        instance, raw_key = APIKey.create_key(
            organization=org,
            name="Test Key",
            scope=APIKey.Scope.READ,
            created_by=user,
        )

        assert isinstance(instance, APIKey)
        assert isinstance(raw_key, str)
        assert raw_key.startswith("gh_")
        assert instance.prefix == raw_key[:12]
        assert instance.hashed_key == APIKey.hash_key(raw_key)
        assert instance.organization == org
        assert instance.name == "Test Key"
        assert instance.scope == APIKey.Scope.READ

    def test_hash_key(self):
        """APIKey.hash_key returns a consistent SHA-256 hex digest."""
        raw = "gh_abcdef1234567890"
        expected = hashlib.sha256(raw.encode()).hexdigest()
        assert APIKey.hash_key(raw) == expected
        # Consistency: calling again yields same result
        assert APIKey.hash_key(raw) == expected

    def test_is_usable(self):
        """An active, non-expired key is usable."""
        org, user = _create_org_with_owner()
        instance, _ = APIKey.create_key(
            organization=org,
            name="Usable Key",
            scope=APIKey.Scope.READ,
            created_by=user,
            expires_at=timezone.now() + timedelta(days=30),
        )

        assert instance.is_active is True
        assert instance.is_expired is False
        assert instance.is_usable is True

    def test_is_expired(self):
        """An expired key is not usable even if active."""
        org, user = _create_org_with_owner()
        instance, _ = APIKey.create_key(
            organization=org,
            name="Expired Key",
            scope=APIKey.Scope.READ,
            created_by=user,
            expires_at=timezone.now() - timedelta(hours=1),
        )

        assert instance.is_expired is True
        assert instance.is_usable is False

    def test_scope_level(self):
        """Scope levels are READ=0, WRITE=1, ADMIN=2."""
        org, user = _create_org_with_owner()

        for scope, expected_level in [
            (APIKey.Scope.READ, 0),
            (APIKey.Scope.WRITE, 1),
            (APIKey.Scope.ADMIN, 2),
        ]:
            instance, _ = APIKey.create_key(
                organization=org,
                name=f"{scope} Key",
                scope=scope,
                created_by=user,
            )
            assert instance.scope_level == expected_level

    def test_rate_limit(self):
        """Rate limit varies by org plan: FREE=60, PRO=300, ENTERPRISE=1000."""
        for plan, expected_rate in [
            (Organization.Plan.FREE, 60),
            (Organization.Plan.PRO, 300),
            (Organization.Plan.ENTERPRISE, 1000),
        ]:
            org, user = _create_org_with_owner(plan=plan)
            instance, _ = APIKey.create_key(
                organization=org,
                name=f"{plan} Key",
                scope=APIKey.Scope.READ,
                created_by=user,
            )
            assert instance.rate_limit == expected_rate


# ============================================================================
# 2. TestAPIKeyAuthentication
# ============================================================================


@pytest.mark.django_db
class TestAPIKeyAuthentication:
    """Tests for the APIKeyAuthentication backend (X-API-Key header)."""

    def test_auth_with_valid_key(self):
        """A valid X-API-Key header authenticates correctly and returns user data."""
        org, user = _create_org_with_owner()
        _, raw_key = APIKey.create_key(
            organization=org,
            name="Valid Key",
            scope=APIKey.Scope.READ,
            created_by=user,
        )

        client = _api_key_client(raw_key)
        response = client.get("/api/greenhouses/")
        assert response.status_code == status.HTTP_200_OK

    def test_auth_with_invalid_key(self):
        """An invalid API key returns 401."""
        client = _api_key_client("gh_invalid_key_that_does_not_exist")
        response = client.get("/api/greenhouses/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auth_with_expired_key(self):
        """An expired API key returns 401."""
        org, user = _create_org_with_owner()
        _, raw_key = APIKey.create_key(
            organization=org,
            name="Expired Key",
            scope=APIKey.Scope.READ,
            created_by=user,
            expires_at=timezone.now() - timedelta(hours=1),
        )

        client = _api_key_client(raw_key)
        response = client.get("/api/greenhouses/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auth_with_inactive_key(self):
        """An inactive API key returns 401."""
        org, user = _create_org_with_owner()
        instance, raw_key = APIKey.create_key(
            organization=org,
            name="Inactive Key",
            scope=APIKey.Scope.READ,
            created_by=user,
        )
        instance.is_active = False
        instance.save(update_fields=["is_active"])

        client = _api_key_client(raw_key)
        response = client.get("/api/greenhouses/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auth_updates_last_used_at(self):
        """last_used_at changes after a successful API key authentication."""
        org, user = _create_org_with_owner()
        instance, raw_key = APIKey.create_key(
            organization=org,
            name="Tracking Key",
            scope=APIKey.Scope.READ,
            created_by=user,
        )

        assert instance.last_used_at is None

        client = _api_key_client(raw_key)
        client.get("/api/greenhouses/")

        instance.refresh_from_db()
        assert instance.last_used_at is not None


# ============================================================================
# 3. TestAPIKeyScopePermissions
# ============================================================================


@pytest.mark.django_db
class TestAPIKeyScopePermissions:
    """Tests for scope-based permission enforcement via HasAPIKeyScope.

    Uses the webhook endpoints which include the HasAPIKeyScope permission
    class. The API key auth resolves the org OWNER as user, who has ADMIN+
    membership, satisfying the admin-level checks in the views.
    """

    def _setup(self, scope: str):
        """Create an org, owner, a webhook, and an API key with the given scope."""
        org, user = _create_org_with_owner()
        webhook = Webhook.objects.create(
            organization=org,
            name="Scope Test Hook",
            url="https://example.com/hook",
            events=["new_reading"],
            created_by=user,
        )
        _, raw_key = APIKey.create_key(
            organization=org,
            name=f"{scope} Scope Key",
            scope=scope,
            created_by=user,
        )
        return org, user, webhook, raw_key

    def test_read_scope_allows_get(self):
        """GET succeeds with a READ scope key."""
        org, _, _, raw_key = self._setup(APIKey.Scope.READ)
        client = _api_key_client(raw_key)
        response = client.get(f"/api/orgs/{org.slug}/webhooks/")
        assert response.status_code == status.HTTP_200_OK

    def test_read_scope_blocks_post(self):
        """POST returns 403 with a READ scope key."""
        org, _, _, raw_key = self._setup(APIKey.Scope.READ)
        client = _api_key_client(raw_key)
        response = client.post(
            f"/api/orgs/{org.slug}/webhooks/",
            {"name": "New Hook", "url": "https://example.com/new", "events": ["new_reading"]},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_write_scope_allows_post(self):
        """POST succeeds with a WRITE scope key."""
        org, _, _, raw_key = self._setup(APIKey.Scope.WRITE)
        client = _api_key_client(raw_key)
        response = client.post(
            f"/api/orgs/{org.slug}/webhooks/",
            {"name": "New Hook", "url": "https://example.com/new", "events": ["new_reading"]},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_write_scope_blocks_delete(self):
        """DELETE returns 403 with a WRITE scope key."""
        org, _, webhook, raw_key = self._setup(APIKey.Scope.WRITE)
        client = _api_key_client(raw_key)
        response = client.delete(f"/api/orgs/{org.slug}/webhooks/{webhook.pk}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_scope_allows_delete(self):
        """DELETE succeeds with an ADMIN scope key."""
        org, _, webhook, raw_key = self._setup(APIKey.Scope.ADMIN)
        client = _api_key_client(raw_key)
        response = client.delete(f"/api/orgs/{org.slug}/webhooks/{webhook.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT


# ============================================================================
# 4. TestAPIKeyEndpoints
# ============================================================================


@pytest.mark.django_db
class TestAPIKeyEndpoints:
    """Tests for the API key management endpoints."""

    def _setup_admin(self):
        """Create an org with an ADMIN user and return (org, user, jwt_client)."""
        org = OrganizationFactory()
        user = UserFactory()
        MembershipFactory(user=user, organization=org, role=Membership.Role.ADMIN)
        return org, user, _jwt_client(user)

    def test_list_api_keys(self):
        """GET /api/orgs/{slug}/api-keys/ returns a list of keys."""
        org, user, client = self._setup_admin()
        APIKey.create_key(organization=org, name="Key 1", scope=APIKey.Scope.READ, created_by=user)
        APIKey.create_key(organization=org, name="Key 2", scope=APIKey.Scope.WRITE, created_by=user)

        response = client.get(f"/api/orgs/{org.slug}/api-keys/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 2

    def test_create_api_key(self):
        """POST /api/orgs/{slug}/api-keys/ returns raw_key and key object."""
        org, user, client = self._setup_admin()

        response = client.post(
            f"/api/orgs/{org.slug}/api-keys/",
            {"name": "My New Key", "scope": "WRITE"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert "raw_key" in response.data
        assert response.data["raw_key"].startswith("gh_")
        assert "key" in response.data
        assert response.data["key"]["name"] == "My New Key"
        assert response.data["key"]["scope"] == "WRITE"

    def test_revoke_api_key(self):
        """POST /api/orgs/{slug}/api-keys/{id}/revoke/ deactivates the key."""
        org, user, client = self._setup_admin()
        instance, _ = APIKey.create_key(
            organization=org, name="Revoke Me", scope=APIKey.Scope.READ, created_by=user,
        )

        response = client.post(f"/api/orgs/{org.slug}/api-keys/{instance.pk}/revoke/")
        assert response.status_code == status.HTTP_200_OK

        instance.refresh_from_db()
        assert instance.is_active is False

    def test_delete_api_key(self):
        """DELETE /api/orgs/{slug}/api-keys/{id}/ removes the key."""
        org, user, client = self._setup_admin()
        instance, _ = APIKey.create_key(
            organization=org, name="Delete Me", scope=APIKey.Scope.READ, created_by=user,
        )

        response = client.delete(f"/api/orgs/{org.slug}/api-keys/{instance.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not APIKey.objects.filter(pk=instance.pk).exists()

    def test_logs_endpoint(self):
        """GET /api/orgs/{slug}/api-keys/logs/ returns logs."""
        org, user, client = self._setup_admin()
        instance, _ = APIKey.create_key(
            organization=org, name="Log Key", scope=APIKey.Scope.READ, created_by=user,
        )

        # Create some log entries
        APIKeyLog.objects.create(
            api_key=instance, method="GET", path="/api/greenhouses/",
            status_code=200, ip_address="127.0.0.1", user_agent="test-agent",
        )
        APIKeyLog.objects.create(
            api_key=instance, method="POST", path="/api/greenhouses/",
            status_code=201, ip_address="127.0.0.1", user_agent="test-agent",
        )

        response = client.get(f"/api/orgs/{org.slug}/api-keys/logs/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 2

    def test_non_admin_denied(self):
        """VIEWER and OPERATOR cannot manage API keys."""
        org = OrganizationFactory()
        for role in [Membership.Role.VIEWER, Membership.Role.OPERATOR]:
            user = UserFactory()
            MembershipFactory(user=user, organization=org, role=role)
            client = _jwt_client(user)

            response = client.get(f"/api/orgs/{org.slug}/api-keys/")
            assert response.status_code == status.HTTP_403_FORBIDDEN, (
                f"Expected 403 for role {role}, got {response.status_code}"
            )


# ============================================================================
# 5. TestWebhookEndpoints
# ============================================================================


@pytest.mark.django_db
class TestWebhookEndpoints:
    """Tests for the Webhook CRUD endpoints."""

    def _setup_admin(self):
        """Create an org with an ADMIN user and return (org, user, jwt_client)."""
        org = OrganizationFactory()
        user = UserFactory()
        MembershipFactory(user=user, organization=org, role=Membership.Role.ADMIN)
        return org, user, _jwt_client(user)

    def test_list_webhooks(self):
        """GET /api/orgs/{slug}/webhooks/ returns a list."""
        org, user, client = self._setup_admin()
        Webhook.objects.create(
            organization=org, name="Hook 1", url="https://example.com/hook1",
            events=["new_reading"], created_by=user,
        )
        Webhook.objects.create(
            organization=org, name="Hook 2", url="https://example.com/hook2",
            events=["alert_created"], created_by=user,
        )

        response = client.get(f"/api/orgs/{org.slug}/webhooks/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 2

    def test_create_webhook(self):
        """POST /api/orgs/{slug}/webhooks/ creates a webhook with events."""
        org, user, client = self._setup_admin()

        payload = {
            "name": "My Webhook",
            "url": "https://example.com/webhook",
            "events": ["new_reading", "alert_created"],
            "secret": "supersecret",
        }
        response = client.post(f"/api/orgs/{org.slug}/webhooks/", payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Webhook"
        assert response.data["events"] == ["new_reading", "alert_created"]
        # Secret should not be returned in response
        assert "secret" not in response.data or response.data.get("secret") is None
        # has_secret should be True
        assert response.data.get("has_secret") is True

    def test_update_webhook(self):
        """PATCH /api/orgs/{slug}/webhooks/{id}/ updates the webhook."""
        org, user, client = self._setup_admin()
        hook = Webhook.objects.create(
            organization=org, name="Old Name", url="https://example.com/old",
            events=["new_reading"], created_by=user,
        )

        response = client.patch(
            f"/api/orgs/{org.slug}/webhooks/{hook.pk}/",
            {"name": "New Name"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        hook.refresh_from_db()
        assert hook.name == "New Name"

    def test_delete_webhook(self):
        """DELETE /api/orgs/{slug}/webhooks/{id}/ removes the webhook."""
        org, user, client = self._setup_admin()
        hook = Webhook.objects.create(
            organization=org, name="Delete Me", url="https://example.com/del",
            events=["command_ack"], created_by=user,
        )

        response = client.delete(f"/api/orgs/{org.slug}/webhooks/{hook.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Webhook.objects.filter(pk=hook.pk).exists()

    def test_webhook_deliveries(self):
        """GET /api/orgs/{slug}/webhooks/deliveries/ returns delivery records."""
        org, user, client = self._setup_admin()
        hook = Webhook.objects.create(
            organization=org, name="Hook", url="https://example.com/h",
            events=["new_reading"], created_by=user,
        )
        WebhookDelivery.objects.create(
            webhook=hook, event_type="new_reading", payload={"value": 22.5},
            response_status=200, status=WebhookDelivery.Status.SUCCESS, duration_ms=42,
        )

        response = client.get(f"/api/orgs/{org.slug}/webhooks/deliveries/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["event_type"] == "new_reading"

    def test_invalid_events(self):
        """POST with an invalid event type returns 400."""
        org, user, client = self._setup_admin()

        payload = {
            "name": "Bad Hook",
            "url": "https://example.com/bad",
            "events": ["invalid_event_type"],
        }
        response = client.post(f"/api/orgs/{org.slug}/webhooks/", payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# 6. TestWebhookDelivery
# ============================================================================


@pytest.mark.django_db
class TestWebhookDelivery:
    """Tests for the deliver_webhook and dispatch_webhooks Celery tasks."""

    def _create_webhook(self, secret: str = "", events: list | None = None):
        """Helper to create an org + webhook and return (webhook, org)."""
        org, user = _create_org_with_owner()
        hook = Webhook.objects.create(
            organization=org,
            name="Test Hook",
            url="https://example.com/webhook",
            events=events or ["new_reading"],
            secret=secret,
            created_by=user,
        )
        return hook, org

    @patch("apps.api.tasks.requests.post")
    def test_deliver_webhook_success(self, mock_post):
        """Mock requests.post to return 200; check WebhookDelivery created with SUCCESS."""
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.text = '{"ok": true}'
        mock_post.return_value = mock_response

        hook, _ = self._create_webhook()
        payload = {"sensor": "TEMP", "value": 23.5}

        deliver_webhook(hook.id, "new_reading", payload)

        delivery = WebhookDelivery.objects.get(webhook=hook)
        assert delivery.status == WebhookDelivery.Status.SUCCESS
        assert delivery.response_status == 200
        assert delivery.event_type == "new_reading"
        assert delivery.duration_ms is not None

        hook.refresh_from_db()
        assert hook.failure_count == 0
        assert hook.last_triggered_at is not None

    @patch("apps.api.tasks.requests.post")
    def test_deliver_webhook_failure(self, mock_post):
        """Mock requests.post to return 500; check FAILED status."""
        mock_response = MagicMock()
        mock_response.ok = False
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        hook, _ = self._create_webhook()
        payload = {"sensor": "TEMP", "value": 23.5}

        deliver_webhook(hook.id, "new_reading", payload)

        delivery = WebhookDelivery.objects.get(webhook=hook)
        assert delivery.status == WebhookDelivery.Status.FAILED
        assert delivery.response_status == 500

        hook.refresh_from_db()
        assert hook.failure_count == 1

    @patch("apps.api.tasks.requests.post")
    def test_deliver_webhook_timeout(self, mock_post):
        """Mock requests.post to raise Timeout; check FAILED status."""
        import requests as req_lib

        mock_post.side_effect = req_lib.exceptions.Timeout("Connection timed out")

        hook, _ = self._create_webhook()
        payload = {"sensor": "TEMP", "value": 23.5}

        deliver_webhook(hook.id, "new_reading", payload)

        delivery = WebhookDelivery.objects.get(webhook=hook)
        assert delivery.status == WebhookDelivery.Status.FAILED
        assert "timed out" in delivery.error_message.lower()

        hook.refresh_from_db()
        assert hook.failure_count == 1

    @patch("apps.api.tasks.deliver_webhook.delay")
    def test_dispatch_webhooks_filters_by_event(self, mock_delay):
        """dispatch_webhooks only triggers webhooks subscribed to the event."""
        org, user = _create_org_with_owner()

        hook_reading = Webhook.objects.create(
            organization=org, name="Reading Hook",
            url="https://example.com/readings",
            events=["new_reading"], created_by=user,
        )
        hook_alert = Webhook.objects.create(
            organization=org, name="Alert Hook",
            url="https://example.com/alerts",
            events=["alert_created"], created_by=user,
        )
        hook_both = Webhook.objects.create(
            organization=org, name="Both Hook",
            url="https://example.com/both",
            events=["new_reading", "alert_created"], created_by=user,
        )

        payload = {"sensor": "TEMP", "value": 23.5}
        dispatch_webhooks("new_reading", payload, org.id)

        # Should be called for hook_reading and hook_both (not hook_alert)
        called_ids = {call.args[0] for call in mock_delay.call_args_list}
        assert hook_reading.id in called_ids
        assert hook_both.id in called_ids
        assert hook_alert.id not in called_ids
        assert mock_delay.call_count == 2

    @patch("apps.api.tasks.requests.post")
    def test_webhook_hmac_signature(self, mock_post):
        """When secret is set, X-Webhook-Signature header is computed with HMAC-SHA256."""
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.status_code = 200
        mock_response.text = '{"ok": true}'
        mock_post.return_value = mock_response

        secret = "my-webhook-secret"
        hook, _ = self._create_webhook(secret=secret)
        payload = {"sensor": "TEMP", "value": 23.5}

        deliver_webhook(hook.id, "new_reading", payload)

        # Verify that requests.post was called with the HMAC signature header
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers")

        assert "X-Webhook-Signature" in headers

        # Verify the signature matches the expected HMAC-SHA256
        body = call_kwargs.kwargs.get("data") or call_kwargs[1].get("data")
        expected_sig = hmac.new(
            secret.encode("utf-8"),
            body.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        assert headers["X-Webhook-Signature"] == expected_sig


# ============================================================================
# 7. TestAPIVersioning
# ============================================================================


@pytest.mark.django_db
class TestAPIVersioning:
    """Tests for API versioning and schema endpoints."""

    def test_v1_prefix_works(self):
        """GET /api/v1/greenhouses/ returns the same results as /api/greenhouses/."""
        org, user = _create_org_with_owner()
        GreenhouseFactory(owner=user, organization=org)
        client = _jwt_client(user)

        response_unversioned = client.get("/api/greenhouses/")
        response_v1 = client.get("/api/v1/greenhouses/")

        assert response_unversioned.status_code == status.HTTP_200_OK
        assert response_v1.status_code == status.HTTP_200_OK

        results_unversioned = response_unversioned.data.get("results", response_unversioned.data)
        results_v1 = response_v1.data.get("results", response_v1.data)
        assert len(results_unversioned) == len(results_v1)

    def test_schema_endpoint(self):
        """GET /api/schema/ returns an OpenAPI schema."""
        org, user = _create_org_with_owner()
        client = _jwt_client(user)

        response = client.get("/api/schema/")
        assert response.status_code == status.HTTP_200_OK


# ============================================================================
# 8. TestSandbox
# ============================================================================


@pytest.mark.django_db
class TestSandbox:
    """Tests for the developer sandbox endpoint."""

    def test_sandbox_not_found(self):
        """GET /api/developer/sandbox/ returns 404 when no sandbox org exists."""
        org, user = _create_org_with_owner()
        client = _jwt_client(user)

        response = client.get("/api/developer/sandbox/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.data["detail"].lower()

    def test_sandbox_info(self):
        """GET /api/developer/sandbox/ returns sandbox info when the org exists."""
        # Create the sandbox organization
        sandbox_org = OrganizationFactory(
            name="Sandbox",
            slug="sandbox",
            plan=Organization.Plan.FREE,
        )

        # Create a user to authenticate
        org, user = _create_org_with_owner()
        client = _jwt_client(user)

        response = client.get("/api/developer/sandbox/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Sandbox"
        assert response.data["slug"] == "sandbox"
        assert "greenhouse_count" in response.data
        assert "zone_count" in response.data
        assert "api_keys_count" in response.data
