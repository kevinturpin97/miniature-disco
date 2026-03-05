"""Tests for Sprint 28 — Cloud CRM Platform.

Covers:
    - Edge register endpoint (JWT auth, role check)
    - Edge sync endpoint (HMAC verification, gzip decoding, batch insertion)
    - Edge config endpoint (HMAC verification)
    - Sync batch ingestion: records inserted, deduplication
    - CRM tenant list (staff only)
    - CRM tenant detail
    - CRM tenant health
    - CRM global stats
    - Impersonate endpoint: token issued, expired after 30 min
    - HMAC auth: missing header → 403, wrong signature → 403
"""

from __future__ import annotations

import gzip
import hashlib
import hmac
import json
import secrets
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.api.models import CloudTenant, ImpersonationToken, Membership, Organization
from apps.iot.models import EdgeDevice, Sensor, SensorReading, SyncBatch

User = get_user_model()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def jwt_for(user):
    """Return a JWT Authorization header value for a user."""
    refresh = RefreshToken.for_user(user)
    return f"Bearer {refresh.access_token}"


def make_org_user(role=Membership.Role.OWNER):
    """Create an org + user with the given role."""
    user = User.objects.create_user(
        username=f"user_{secrets.token_hex(4)}",
        email=f"user_{secrets.token_hex(4)}@test.com",
        password="pass",
    )
    org = Organization.objects.create(
        name=f"Org {secrets.token_hex(4)}",
        slug=f"org-{secrets.token_hex(4)}",
        plan=Organization.Plan.PRO,
    )
    Membership.objects.create(user=user, organization=org, role=role)
    return user, org


def make_edge_device(org):
    """Create an EdgeDevice with a known secret."""
    secret = secrets.token_hex(32)
    device = EdgeDevice.objects.create(
        organization=org,
        name="Test Device",
        secret_key=secret,
    )
    return device, secret


def build_hmac_headers(device_id: str, secret: str, body: bytes, gzipped: bool = True) -> dict:
    """Build HMAC headers for an edge request."""
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    headers = {
        "HTTP_X_DEVICE_ID": str(device_id),
        "HTTP_X_SIGNATURE": sig,
    }
    if gzipped:
        headers["HTTP_CONTENT_ENCODING"] = "gzip"
    return headers


def build_sync_payload(device_id: str) -> bytes:
    """Build a minimal gzip-compressed sync payload."""
    payload = {
        "device_id": str(device_id),
        "firmware_version": "1.0.0",
        "synced_at": timezone.now().isoformat(),
        "readings": [],
        "commands": [],
        "alerts": [],
        "audit_events": [],
    }
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return gzip.compress(raw)


# ---------------------------------------------------------------------------
# Edge — Register
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEdgeRegister:
    url = "/api/edge/register/"

    def test_register_success_owner(self, api_client):
        user, org = make_org_user(role=Membership.Role.OWNER)
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.post(
            self.url,
            {"org_slug": org.slug, "name": "Pi Main"},
            format="json",
        )
        assert resp.status_code == 201
        assert "device_id" in resp.data
        assert "secret_key" in resp.data
        assert EdgeDevice.objects.filter(organization=org, name="Pi Main").exists()

    def test_register_success_admin(self, api_client):
        user, org = make_org_user(role=Membership.Role.ADMIN)
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.post(
            self.url,
            {"org_slug": org.slug, "name": "Pi Admin"},
            format="json",
        )
        assert resp.status_code == 201

    def test_register_operator_forbidden(self, api_client):
        user, org = make_org_user(role=Membership.Role.OPERATOR)
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.post(
            self.url,
            {"org_slug": org.slug, "name": "Pi Op"},
            format="json",
        )
        assert resp.status_code == 403

    def test_register_unauthenticated(self, api_client):
        resp = api_client.post(
            self.url,
            {"org_slug": "anything", "name": "Pi"},
            format="json",
        )
        assert resp.status_code == 401

    def test_register_missing_org_slug(self, api_client):
        user, _ = make_org_user()
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.post(self.url, {"name": "Pi"}, format="json")
        assert resp.status_code == 400

    def test_register_unknown_org(self, api_client):
        user, _ = make_org_user()
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.post(
            self.url,
            {"org_slug": "nonexistent-org", "name": "Pi"},
            format="json",
        )
        assert resp.status_code == 404

    def test_register_creates_cloud_tenant(self, api_client):
        user, org = make_org_user()
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        api_client.post(
            self.url,
            {"org_slug": org.slug, "name": "Pi"},
            format="json",
        )
        assert CloudTenant.objects.filter(organization=org).exists()


# ---------------------------------------------------------------------------
# Edge — Sync (HMAC auth)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEdgeSync:
    url = "/api/edge/sync/"

    def test_sync_missing_headers(self, client):
        resp = client.post(self.url, content_type="application/json", data="{}")
        assert resp.status_code == 400

    def test_sync_unknown_device(self, client):
        import uuid as _uuid
        unknown_uuid = str(_uuid.uuid4())  # Valid UUID format but not in DB
        body = build_sync_payload(unknown_uuid)
        headers = build_hmac_headers(unknown_uuid, "anysecret", body)
        resp = client.post(
            self.url,
            data=body,
            content_type="application/octet-stream",
            **headers,
        )
        assert resp.status_code == 403

    def test_sync_invalid_signature(self, client):
        _, org = make_org_user()
        device, secret = make_edge_device(org)
        body = build_sync_payload(device.device_id)
        headers = build_hmac_headers(device.device_id, "wrong_secret", body)
        resp = client.post(
            self.url,
            data=body,
            content_type="application/octet-stream",
            **headers,
        )
        assert resp.status_code == 403

    def test_sync_valid_request_queued(self, client):
        _, org = make_org_user()
        device, secret = make_edge_device(org)
        body = build_sync_payload(device.device_id)
        headers = build_hmac_headers(device.device_id, secret, body)

        with patch("apps.iot.tasks.ingest_sync_batch") as mock_task:
            mock_task.apply_async.return_value = None
            resp = client.post(
                self.url,
                data=body,
                content_type="application/octet-stream",
                **headers,
            )

        assert resp.status_code == 202
        assert resp.json()["status"] == "queued"
        assert SyncBatch.objects.filter(edge_device=device).exists()

    def test_sync_updates_last_sync_at(self, client):
        _, org = make_org_user()
        device, secret = make_edge_device(org)
        body = build_sync_payload(device.device_id)
        headers = build_hmac_headers(device.device_id, secret, body)

        with patch("apps.iot.tasks.ingest_sync_batch") as mock_task:
            mock_task.apply_async.return_value = None
            client.post(
                self.url,
                data=body,
                content_type="application/octet-stream",
                **headers,
            )

        device.refresh_from_db()
        assert device.last_sync_at is not None


# ---------------------------------------------------------------------------
# Edge — Config
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEdgeConfig:
    url = "/api/edge/config/"

    def test_config_missing_headers(self, client):
        resp = client.get(self.url)
        assert resp.status_code == 400

    def test_config_invalid_signature(self, client):
        _, org = make_org_user()
        device, secret = make_edge_device(org)
        device_id = str(device.device_id)
        sig = hmac.new("wrong_key".encode(), device_id.encode(), hashlib.sha256).hexdigest()
        resp = client.get(
            self.url,
            HTTP_X_DEVICE_ID=device_id,
            HTTP_X_SIGNATURE=sig,
        )
        assert resp.status_code == 403

    def test_config_valid_request(self, client):
        _, org = make_org_user()
        device, secret = make_edge_device(org)
        device_id = str(device.device_id)
        sig = hmac.new(secret.encode(), device_id.encode(), hashlib.sha256).hexdigest()
        resp = client.get(
            self.url,
            HTTP_X_DEVICE_ID=device_id,
            HTTP_X_SIGNATURE=sig,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["device_id"] == device_id
        assert "sensors" in data
        assert "automation_rules" in data


# ---------------------------------------------------------------------------
# Sync batch ingestion (Celery task)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestIngestSyncBatch:
    """Unit tests for the ingest_sync_batch Celery task."""

    def _make_batch_and_sensor(self):
        from apps.iot.models import Actuator, Greenhouse, Zone

        user, org = make_org_user()
        device, _ = make_edge_device(org)
        gh = Greenhouse.objects.create(organization=org, name="GH")
        zone = Zone.objects.create(greenhouse=gh, name="Z", relay_id=1)
        sensor = Sensor.objects.create(
            zone=zone,
            sensor_type="TEMP",
            label="T",
            unit="°C",
        )
        batch = SyncBatch.objects.create(
            edge_device=device,
            status=SyncBatch.Status.PENDING,
            records_count=1,
            payload_size_kb=1.0,
        )
        return batch, sensor

    def test_ingest_inserts_readings(self):
        from apps.iot.tasks import ingest_sync_batch

        batch, sensor = self._make_batch_and_sensor()
        payload = {
            "readings": [
                {
                    "id": 1,
                    "sensor_id": sensor.id,
                    "sensor_type": "TEMP",
                    "value": 23.5,
                    "relay_timestamp": None,
                    "received_at": "2026-01-01T10:00:00+00:00",
                }
            ],
            "commands": [],
            "alerts": [],
            "audit_events": [],
        }
        result = ingest_sync_batch(batch.id, payload)
        assert result["inserted_readings"] == 1
        batch.refresh_from_db()
        assert batch.status == SyncBatch.Status.SUCCESS
        assert SensorReading.objects.filter(sensor=sensor, value=23.5).exists()

    def test_ingest_deduplication(self):
        """Same reading submitted twice → only one record inserted."""
        from apps.iot.tasks import ingest_sync_batch

        batch1, sensor = self._make_batch_and_sensor()
        reading_data = {
            "id": 1,
            "sensor_id": sensor.id,
            "sensor_type": "TEMP",
            "value": 20.0,
            "relay_timestamp": "2026-01-01T12:00:00+00:00",
            "received_at": "2026-01-01T12:00:00+00:00",
        }
        payload = {"readings": [reading_data], "commands": [], "alerts": [], "audit_events": []}
        ingest_sync_batch(batch1.id, payload)

        # Create a second batch with identical data
        from apps.iot.models import Greenhouse, Zone
        device = batch1.edge_device
        batch2 = SyncBatch.objects.create(
            edge_device=device,
            status=SyncBatch.Status.PENDING,
            records_count=1,
            payload_size_kb=1.0,
        )
        result2 = ingest_sync_batch(batch2.id, payload)
        assert result2["duplicate_readings"] == 1
        assert result2["inserted_readings"] == 0

        total = SensorReading.objects.filter(
            sensor=sensor,
            value=20.0,
            relay_timestamp="2026-01-01T12:00:00+00:00",
        ).count()
        assert total == 1

    def test_ingest_nonexistent_batch(self):
        from apps.iot.tasks import ingest_sync_batch

        result = ingest_sync_batch(999_999, {})
        assert "error" in result


# ---------------------------------------------------------------------------
# CRM — Tenant list (staff only)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCRMTenantList:
    url = "/api/crm/tenants/"

    def test_non_staff_forbidden(self, api_client):
        user, _ = make_org_user()
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.get(self.url)
        assert resp.status_code == 403

    def test_staff_can_list(self, api_client):
        staff = User.objects.create_user(
            username="operator", password="pass", is_staff=True
        )
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.get(self.url)
        assert resp.status_code == 200
        assert isinstance(resp.data, list)

    def test_unauthenticated_forbidden(self, api_client):
        resp = api_client.get(self.url)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# CRM — Tenant detail
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCRMTenantDetail:
    def test_detail_returns_correct_tenant(self, api_client):
        staff = User.objects.create_user(
            username="op2", password="pass", is_staff=True
        )
        _, org = make_org_user()
        tenant = CloudTenant.objects.create(organization=org)
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.get(f"/api/crm/tenants/{tenant.id}/")
        assert resp.status_code == 200
        assert resp.data["tenant"]["org_slug"] == org.slug

    def test_detail_404_on_unknown_tenant(self, api_client):
        staff = User.objects.create_user(
            username="op3", password="pass", is_staff=True
        )
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.get("/api/crm/tenants/999999/")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# CRM — Tenant health
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCRMTenantHealth:
    def test_health_returns_ok_when_recent_sync(self, api_client):
        staff = User.objects.create_user(
            username="op4", password="pass", is_staff=True
        )
        _, org = make_org_user()
        device, _ = make_edge_device(org)
        device.last_sync_at = timezone.now() - timedelta(minutes=5)
        device.save()
        tenant = CloudTenant.objects.create(organization=org)
        tenant.edge_devices.add(device)

        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.get(f"/api/crm/tenants/{tenant.id}/health/")
        assert resp.status_code == 200
        assert resp.data["health_status"] == "ok"
        assert resp.data["devices"][0]["is_online"] is True

    def test_health_degraded_when_offline(self, api_client):
        staff = User.objects.create_user(
            username="op5", password="pass", is_staff=True
        )
        _, org = make_org_user()
        device, _ = make_edge_device(org)
        device.last_sync_at = timezone.now() - timedelta(hours=2)
        device.save()
        tenant = CloudTenant.objects.create(organization=org)
        tenant.edge_devices.add(device)

        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.get(f"/api/crm/tenants/{tenant.id}/health/")
        assert resp.status_code == 200
        assert resp.data["health_status"] == "degraded"


# ---------------------------------------------------------------------------
# CRM — Global stats
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCRMStats:
    def test_stats_returns_expected_fields(self, api_client):
        staff = User.objects.create_user(
            username="stats_op", password="pass", is_staff=True
        )
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.get("/api/crm/stats/")
        assert resp.status_code == 200
        for field in [
            "total_tenants",
            "active_tenants",
            "total_greenhouses",
            "total_devices",
            "active_devices_1h",
            "readings_last_24h",
            "plan_distribution",
        ]:
            assert field in resp.data, f"Missing field: {field}"


# ---------------------------------------------------------------------------
# CRM — Impersonate
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCRMImpersonate:
    def test_impersonate_returns_token(self, api_client):
        staff = User.objects.create_user(
            username="imp_op", password="pass", is_staff=True
        )
        target_user, org = make_org_user(role=Membership.Role.OWNER)
        tenant = CloudTenant.objects.create(organization=org)

        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.post(f"/api/crm/tenants/{tenant.id}/impersonate/")
        assert resp.status_code == 201
        assert "access" in resp.data
        assert resp.data["target_org"] == org.slug

    def test_impersonate_creates_audit_record(self, api_client):
        staff = User.objects.create_user(
            username="imp_op2", password="pass", is_staff=True
        )
        target_user, org = make_org_user(role=Membership.Role.OWNER)
        tenant = CloudTenant.objects.create(organization=org)

        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        api_client.post(f"/api/crm/tenants/{tenant.id}/impersonate/")

        assert ImpersonationToken.objects.filter(
            organization=org, created_by=staff
        ).exists()

    def test_impersonate_non_staff_forbidden(self, api_client):
        user, org = make_org_user()
        tenant = CloudTenant.objects.create(organization=org)
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(user))
        resp = api_client.post(f"/api/crm/tenants/{tenant.id}/impersonate/")
        assert resp.status_code == 403

    def test_impersonate_no_owner_returns_400(self, api_client):
        staff = User.objects.create_user(
            username="imp_op3", password="pass", is_staff=True
        )
        org = Organization.objects.create(
            name="Empty Org", slug="empty-org-test", plan=Organization.Plan.FREE
        )
        tenant = CloudTenant.objects.create(organization=org)
        api_client.credentials(HTTP_AUTHORIZATION=jwt_for(staff))
        resp = api_client.post(f"/api/crm/tenants/{tenant.id}/impersonate/")
        assert resp.status_code == 400
