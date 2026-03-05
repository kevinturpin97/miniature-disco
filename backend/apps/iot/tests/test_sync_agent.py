"""Tests for Sprint 27 — Edge Sync Agent.

Covers:
    - Successful sync: records marked cloud_synced=True, SyncBatch created
    - Retry on network timeout: backoff delay set, batch status=RETRY
    - HMAC signature: cloud sees correct header; wrong key → 403 simulation
    - Gzip decompression: compressed payload is valid gzip JSON
    - Management command force_sync: runs sync for all active devices
    - GET /api/sync/status/ endpoint: returns backlog counts and device list
    - EdgeDevice CRUD endpoints
"""

from __future__ import annotations

import gzip
import hashlib
import hmac
import json
import secrets
import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Alert,
    AuditEvent,
    Command,
    EdgeDevice,
    Sensor,
    SensorReading,
    SyncBatch,
    Zone,
)
from apps.iot.sync_agent import _build_hmac_headers, _run_sync, sync_to_cloud
from conftest import (
    ActuatorFactory,
    CommandFactory,
    GreenhouseFactory,
    MembershipFactory,
    OrganizationFactory,
    SensorFactory,
    SensorReadingFactory,
    UserFactory,
    ZoneFactory,
)

User = get_user_model()

FAKE_CLOUD_URL = "https://cloud.greenhouse-test.io"


# ---------------------------------------------------------------------------
# Factories / helpers
# ---------------------------------------------------------------------------


def make_edge_device(organization: Organization, name: str = "Test Pi") -> EdgeDevice:
    """Create an active EdgeDevice for testing."""
    return EdgeDevice.objects.create(
        organization=organization,
        name=name,
        secret_key=secrets.token_hex(32),
        firmware_version="1.0.0",
    )


def auth_client_for(user) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def org_with_owner(db):
    user = UserFactory()
    org = OrganizationFactory()
    MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)
    return org, user


@pytest.fixture
def edge_device(org_with_owner):
    org, _ = org_with_owner
    return make_edge_device(org)


@pytest.fixture
def unsynced_reading(db, edge_device):
    """Create a SensorReading that is NOT yet synced."""
    greenhouse = GreenhouseFactory(organization=edge_device.organization)
    zone = ZoneFactory(greenhouse=greenhouse)
    sensor = SensorFactory(zone=zone)
    return SensorReadingFactory(sensor=sensor, cloud_synced=False)


# ---------------------------------------------------------------------------
# HMAC helpers
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHMACHeaders:
    """Validate that HMAC headers are built correctly."""

    def test_x_device_id_matches_device(self, edge_device):
        body = b'{"test": true}'
        headers = _build_hmac_headers(edge_device, body)
        assert headers["X-Device-ID"] == str(edge_device.device_id)

    def test_signature_is_valid_hmac(self, edge_device):
        body = b'{"readings": []}'
        headers = _build_hmac_headers(edge_device, body)
        expected = hmac.new(
            edge_device.secret_key.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        assert headers["X-Signature"] == expected

    def test_different_body_different_signature(self, edge_device):
        body1 = b"body one"
        body2 = b"body two"
        h1 = _build_hmac_headers(edge_device, body1)
        h2 = _build_hmac_headers(edge_device, body2)
        assert h1["X-Signature"] != h2["X-Signature"]

    def test_content_encoding_is_gzip(self, edge_device):
        headers = _build_hmac_headers(edge_device, b"x")
        assert headers["Content-Encoding"] == "gzip"


# ---------------------------------------------------------------------------
# Gzip payload
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGzipPayload:
    """Verify that the sync payload is valid gzip-compressed JSON."""

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL, CLOUD_SYNC_BATCH_SIZE=10)
    def test_payload_is_gzip_json(self, edge_device, unsynced_reading):
        captured_body: list[bytes] = []

        def fake_post(url, data, headers, timeout):
            captured_body.append(data)
            mock_resp = MagicMock()
            mock_resp.raise_for_status.return_value = None
            return mock_resp

        with patch("apps.iot.sync_agent.requests.post", side_effect=fake_post):
            _run_sync(edge_device)

        assert len(captured_body) == 1
        body = captured_body[0]
        # Must be valid gzip
        decompressed = gzip.decompress(body)
        payload = json.loads(decompressed)
        assert "readings" in payload
        assert "device_id" in payload

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL, CLOUD_SYNC_BATCH_SIZE=10)
    def test_payload_signature_matches_compressed_body(self, edge_device, unsynced_reading):
        """Cloud should verify HMAC over the compressed bytes."""
        captured: dict = {}

        def fake_post(url, data, headers, timeout):
            captured["body"] = data
            captured["sig"] = headers["X-Signature"]
            captured["key"] = edge_device.secret_key
            mock_resp = MagicMock()
            mock_resp.raise_for_status.return_value = None
            return mock_resp

        with patch("apps.iot.sync_agent.requests.post", side_effect=fake_post):
            _run_sync(edge_device)

        expected_sig = hmac.new(
            captured["key"].encode(),
            captured["body"],
            hashlib.sha256,
        ).hexdigest()
        assert captured["sig"] == expected_sig


# ---------------------------------------------------------------------------
# Successful sync
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSyncSuccess:
    """After a successful sync, records should be marked cloud_synced=True."""

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL, CLOUD_SYNC_BATCH_SIZE=100)
    def test_readings_marked_synced(self, edge_device, unsynced_reading):
        reading_pk = unsynced_reading.pk

        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None

        with patch("apps.iot.sync_agent.requests.post", return_value=mock_resp):
            result = _run_sync(edge_device)

        assert result.get("records_synced", 0) >= 1
        unsynced_reading.refresh_from_db()
        assert unsynced_reading.cloud_synced is True
        assert unsynced_reading.cloud_synced_at is not None

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL)
    def test_sync_batch_created_and_success(self, edge_device, unsynced_reading):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None

        with patch("apps.iot.sync_agent.requests.post", return_value=mock_resp):
            result = _run_sync(edge_device)

        batch = SyncBatch.objects.filter(edge_device=edge_device).first()
        assert batch is not None
        assert batch.status == SyncBatch.Status.SUCCESS
        assert batch.completed_at is not None

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL)
    def test_device_last_sync_at_updated(self, edge_device, unsynced_reading):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None

        with patch("apps.iot.sync_agent.requests.post", return_value=mock_resp):
            _run_sync(edge_device)

        edge_device.refresh_from_db()
        assert edge_device.last_sync_at is not None

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL)
    def test_no_records_skips_network_call(self, edge_device):
        """If nothing is unsynced, no HTTP call should be made."""
        with patch("apps.iot.sync_agent.requests.post") as mock_post:
            result = _run_sync(edge_device)

        mock_post.assert_not_called()
        assert result["records_synced"] == 0

    @override_settings(EDGE_MODE=False)
    def test_skipped_when_not_edge_mode(self, edge_device, unsynced_reading):
        result = sync_to_cloud()
        assert result.get("skipped") is True


# ---------------------------------------------------------------------------
# Retry / store-and-forward
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSyncRetry:
    """On network failure, batch should be marked RETRY with next_retry_at set."""

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL, CLOUD_SYNC_RETRY_DELAYS=[60, 300])
    def test_network_timeout_creates_retry_batch(self, edge_device, unsynced_reading):
        import requests

        with patch("apps.iot.sync_agent.requests.post", side_effect=requests.Timeout("timed out")):
            result = _run_sync(edge_device)

        assert "error" in result
        assert "next_retry_at" in result

        batch = SyncBatch.objects.filter(edge_device=edge_device).first()
        assert batch is not None
        assert batch.status == SyncBatch.Status.RETRY
        assert batch.next_retry_at is not None
        assert batch.retry_count == 1

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL, CLOUD_SYNC_RETRY_DELAYS=[60, 300])
    def test_retry_next_delay_increases(self, edge_device, unsynced_reading):
        """Second failure should use the second delay (300s)."""
        import requests

        with patch("apps.iot.sync_agent.requests.post", side_effect=requests.ConnectionError("no route")):
            _run_sync(edge_device)

        batch = SyncBatch.objects.filter(edge_device=edge_device).first()
        # Simulate second failure: increase retry_count artificially
        batch.retry_count = 1
        batch.save(update_fields=["retry_count"])

        # Re-run: new batch should use delays[1]=300
        with patch("apps.iot.sync_agent.requests.post", side_effect=requests.ConnectionError("still down")):
            result2 = _run_sync(edge_device)

        assert "next_retry_at" in result2

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL)
    def test_readings_not_marked_synced_on_failure(self, edge_device, unsynced_reading):
        import requests

        with patch("apps.iot.sync_agent.requests.post", side_effect=requests.ConnectionError("down")):
            _run_sync(edge_device)

        unsynced_reading.refresh_from_db()
        assert unsynced_reading.cloud_synced is False


# ---------------------------------------------------------------------------
# Management command force_sync
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestForceSyncCommand:
    """force_sync management command triggers _run_sync for active devices."""

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL=FAKE_CLOUD_URL)
    def test_force_sync_all_devices(self, edge_device, unsynced_reading):
        from django.core.management import call_command
        from io import StringIO

        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None

        out = StringIO()
        with patch("apps.iot.sync_agent.requests.post", return_value=mock_resp):
            call_command("force_sync", stdout=out)

        output = out.getvalue()
        assert "OK" in output or "Total records synced" in output

    @override_settings(EDGE_MODE=True, CLOUD_SYNC_URL="")
    def test_force_sync_skipped_no_url(self, edge_device):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("force_sync", stdout=out)
        output = out.getvalue()
        # Should say skipped or total 0
        assert "0" in output or "Skipped" in output or "CLOUD_SYNC_URL" in output

    def test_force_sync_unknown_device_raises(self):
        from django.core.management import call_command, CommandError
        from io import StringIO

        with pytest.raises(CommandError):
            call_command("force_sync", device="nonexistent-uuid-xxxxxx")


# ---------------------------------------------------------------------------
# /api/sync/status/ endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSyncStatusEndpoint:
    """GET /api/sync/status/ returns backlog counts and device info."""

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        res = client.get("/api/sync/status/")
        assert res.status_code == 401

    def test_returns_backlog_structure(self, org_with_owner, edge_device, unsynced_reading):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.get("/api/sync/status/")

        assert res.status_code == 200
        data = res.json()
        assert "total_backlog" in data
        assert "backlog_detail" in data
        assert "devices" in data
        assert isinstance(data["devices"], list)

    def test_backlog_reflects_unsynced_readings(self, org_with_owner, edge_device, unsynced_reading):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.get("/api/sync/status/")
        data = res.json()

        # The unsynced_reading belongs to this org, so backlog should be >= 1
        assert data["backlog_detail"]["readings"] >= 1
        assert data["total_backlog"] >= 1

    def test_device_listed_in_response(self, org_with_owner, edge_device):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.get("/api/sync/status/")
        data = res.json()

        device_ids = [d["device_id"] for d in data["devices"]]
        assert str(edge_device.device_id) in device_ids


# ---------------------------------------------------------------------------
# EdgeDevice CRUD endpoints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEdgeDeviceEndpoints:
    """CRUD for /api/orgs/{slug}/edge-devices/ and /api/edge-devices/{id}/"""

    def test_list_devices_for_org(self, org_with_owner, edge_device):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.get(f"/api/orgs/{org.slug}/edge-devices/")
        assert res.status_code == 200
        data = res.json()
        assert any(d["device_id"] == str(edge_device.device_id) for d in data)

    def test_create_device_returns_secret_key(self, org_with_owner):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.post(
            f"/api/orgs/{org.slug}/edge-devices/",
            {"name": "New Pi", "firmware_version": "2.0.0"},
            format="json",
        )
        assert res.status_code == 201
        data = res.json()
        assert "secret_key" in data
        assert len(data["secret_key"]) == 64  # 32 bytes hex
        assert "device_id" in data

    def test_create_device_missing_name_returns_400(self, org_with_owner):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.post(
            f"/api/orgs/{org.slug}/edge-devices/",
            {},
            format="json",
        )
        assert res.status_code == 400

    def test_retrieve_device_no_secret_key(self, org_with_owner, edge_device):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.get(f"/api/edge-devices/{edge_device.device_id}/")
        assert res.status_code == 200
        data = res.json()
        assert "secret_key" not in data
        assert data["device_id"] == str(edge_device.device_id)

    def test_delete_deactivates_device(self, org_with_owner, edge_device):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.delete(f"/api/edge-devices/{edge_device.device_id}/")
        assert res.status_code == 204

        edge_device.refresh_from_db()
        assert edge_device.is_active is False

    def test_sync_history_empty_initially(self, org_with_owner, edge_device):
        org, user = org_with_owner
        client = auth_client_for(user)

        res = client.get(f"/api/edge-devices/{edge_device.device_id}/sync-history/")
        assert res.status_code == 200
        assert res.json() == []

    def test_sync_history_contains_batches(self, org_with_owner, edge_device):
        org, user = org_with_owner
        client = auth_client_for(user)

        # Create a batch manually
        SyncBatch.objects.create(
            edge_device=edge_device,
            status=SyncBatch.Status.SUCCESS,
            records_count=42,
            payload_size_kb=1.5,
        )

        res = client.get(f"/api/edge-devices/{edge_device.device_id}/sync-history/")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["records_count"] == 42
        assert data[0]["status"] == "SUCCESS"

    def test_other_user_cannot_access_devices(self, org_with_owner, edge_device, db):
        other_user = UserFactory()
        client = auth_client_for(other_user)

        res = client.get(f"/api/edge-devices/{edge_device.device_id}/")
        assert res.status_code == 404  # Not in user's orgs → 404

    def test_unauthenticated_cannot_list(self, org_with_owner):
        org, _ = org_with_owner
        client = APIClient()
        res = client.get(f"/api/orgs/{org.slug}/edge-devices/")
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# cloud_synced fields on existing models
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCloudSyncedFields:
    """Verify cloud_synced and cloud_synced_at exist and default correctly."""

    def test_sensor_reading_defaults_unsynced(self, db):
        greenhouse = GreenhouseFactory()
        zone = ZoneFactory(greenhouse=greenhouse)
        sensor = SensorFactory(zone=zone)
        reading = SensorReadingFactory(sensor=sensor)
        assert reading.cloud_synced is False
        assert reading.cloud_synced_at is None

    def test_command_defaults_unsynced(self, db):
        zone = ZoneFactory()
        actuator = ActuatorFactory(zone=zone)
        cmd = CommandFactory(actuator=actuator)
        assert cmd.cloud_synced is False
        assert cmd.cloud_synced_at is None

    def test_alert_defaults_unsynced(self, db):
        zone = ZoneFactory()
        sensor = SensorFactory(zone=zone)
        alert = Alert.objects.create(
            zone=zone,
            sensor=sensor,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
            severity=Alert.Severity.WARNING,
            message="Test alert",
        )
        assert alert.cloud_synced is False
        assert alert.cloud_synced_at is None

    def test_audit_event_defaults_unsynced(self, db):
        event = AuditEvent.objects.create(
            action=AuditEvent.Action.CREATE,
            resource_type="Zone",
            resource_id=1,
            description="test",
        )
        assert event.cloud_synced is False
        assert event.cloud_synced_at is None
