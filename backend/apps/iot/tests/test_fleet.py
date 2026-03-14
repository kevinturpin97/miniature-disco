"""Tests for Sprint 33 — OTA Firmware & Fleet Management.

Covers:
- FirmwareRelease, DeviceOTAJob, DeviceMetrics models
- Fleet API endpoints (list, detail, update, rollback, firmware CRUD)
- OTA lifecycle (PENDING → DOWNLOADING → INSTALLING → SUCCESS/FAILED)
- OTA timeout Celery task
- Device metrics collection task
- Permission checks (cross-org isolation)
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status

from apps.api.models import Membership
from apps.iot.models import DeviceMetrics, DeviceOTAJob, FirmwareRelease

from conftest import (
    DeviceMetricsFactory,
    DeviceOTAJobFactory,
    EdgeDeviceFactory,
    FirmwareReleaseFactory,
    MembershipFactory,
    OrganizationFactory,
    UserFactory,
)


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFirmwareReleaseModel:
    """Tests for the FirmwareRelease model."""

    def test_create_firmware_release(self):
        fw = FirmwareReleaseFactory(version="3.2.1", channel=FirmwareRelease.Channel.STABLE)
        assert fw.version == "3.2.1"
        assert fw.channel == "STABLE"
        assert fw.is_active is True
        assert str(fw) == "Firmware 3.2.1 (STABLE)"

    def test_version_unique(self):
        FirmwareReleaseFactory(version="1.0.0")
        with pytest.raises(Exception):
            FirmwareReleaseFactory(version="1.0.0")

    def test_channels(self):
        stable = FirmwareReleaseFactory(version="3.0.0", channel=FirmwareRelease.Channel.STABLE)
        beta = FirmwareReleaseFactory(version="3.1.0-beta", channel=FirmwareRelease.Channel.BETA)
        nightly = FirmwareReleaseFactory(version="3.2.0-nightly", channel=FirmwareRelease.Channel.NIGHTLY)
        assert stable.channel == "STABLE"
        assert beta.channel == "BETA"
        assert nightly.channel == "NIGHTLY"


@pytest.mark.django_db
class TestDeviceOTAJobModel:
    """Tests for the DeviceOTAJob model."""

    def test_create_ota_job(self):
        job = DeviceOTAJobFactory()
        assert job.status == "PENDING"
        assert job.progress_percent == 0
        assert job.previous_version == "1.0.0"

    def test_str_representation(self):
        job = DeviceOTAJobFactory()
        s = str(job)
        assert "OTA" in s
        assert job.edge_device.name in s
        assert "[PENDING]" in s

    def test_status_transitions(self):
        job = DeviceOTAJobFactory()
        for new_status in [
            DeviceOTAJob.Status.DOWNLOADING,
            DeviceOTAJob.Status.INSTALLING,
            DeviceOTAJob.Status.SUCCESS,
        ]:
            job.status = new_status
            job.save()
            job.refresh_from_db()
            assert job.status == new_status


@pytest.mark.django_db
class TestDeviceMetricsModel:
    """Tests for the DeviceMetrics model."""

    def test_create_metrics(self):
        m = DeviceMetricsFactory(cpu_percent=67.5, memory_percent=48.2, disk_percent=76.0)
        assert m.cpu_percent == 67.5
        assert m.memory_percent == 48.2
        assert m.disk_percent == 76.0

    def test_str_representation(self):
        m = DeviceMetricsFactory()
        s = str(m)
        assert "CPU" in s
        assert "MEM" in s

    def test_ordering_by_recorded_at(self):
        device = EdgeDeviceFactory()
        now = timezone.now()
        m1 = DeviceMetricsFactory(edge_device=device, recorded_at=now - timedelta(hours=1))
        m2 = DeviceMetricsFactory(edge_device=device, recorded_at=now)
        metrics = list(DeviceMetrics.objects.filter(edge_device=device))
        assert metrics[0] == m2  # Most recent first
        assert metrics[1] == m1


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.fixture
def fleet_setup(db):
    """Create a user with org, edge device, firmware, and auth client."""
    user = UserFactory()
    org = OrganizationFactory(name="FleetOrg", slug="fleet-org")
    MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)
    device = EdgeDeviceFactory(
        organization=org,
        name="RPi-001",
        firmware_version="3.1.0",
        last_sync_at=timezone.now(),
    )
    firmware_old = FirmwareReleaseFactory(version="3.1.0")
    firmware_new = FirmwareReleaseFactory(version="3.2.0")

    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    return {
        "user": user,
        "org": org,
        "device": device,
        "firmware_old": firmware_old,
        "firmware_new": firmware_new,
        "client": client,
    }


@pytest.mark.django_db
class TestFleetOverviewAPI:
    """Tests for GET /api/fleet/overview/."""

    def test_overview_returns_stats(self, fleet_setup):
        resp = fleet_setup["client"].get("/api/fleet/overview/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["total_devices"] == 1
        assert data["online_devices"] == 1
        assert data["organizations_count"] == 1

    def test_overview_unauthenticated(self, api_client):
        resp = api_client.get("/api/fleet/overview/")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_overview_counts_outdated(self, fleet_setup):
        # Device is on 3.1.0, latest stable is 3.2.0
        resp = fleet_setup["client"].get("/api/fleet/overview/")
        data = resp.json()
        assert data["outdated_devices"] == 1

    def test_overview_counts_offline(self, fleet_setup):
        device = fleet_setup["device"]
        device.last_sync_at = timezone.now() - timedelta(hours=2)
        device.save()
        resp = fleet_setup["client"].get("/api/fleet/overview/")
        data = resp.json()
        assert data["offline_devices"] == 1
        assert data["online_devices"] == 0


@pytest.mark.django_db
class TestFleetDeviceListAPI:
    """Tests for GET /api/fleet/devices/."""

    def test_list_devices(self, fleet_setup):
        resp = fleet_setup["client"].get("/api/fleet/devices/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "RPi-001"

    def test_list_includes_latest_metrics(self, fleet_setup):
        DeviceMetricsFactory(edge_device=fleet_setup["device"], cpu_percent=67.5)
        resp = fleet_setup["client"].get("/api/fleet/devices/")
        data = resp.json()
        assert data[0]["latest_metrics"] is not None
        assert data[0]["latest_metrics"]["cpu_percent"] == 67.5

    def test_list_cross_org_isolation(self, fleet_setup):
        """Devices from other orgs are not visible."""
        other_org = OrganizationFactory(name="OtherOrg", slug="other-org")
        EdgeDeviceFactory(organization=other_org, name="RPi-Other")
        resp = fleet_setup["client"].get("/api/fleet/devices/")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "RPi-001"


@pytest.mark.django_db
class TestFleetDeviceDetailAPI:
    """Tests for GET /api/fleet/devices/{device_id}/."""

    def test_retrieve_device(self, fleet_setup):
        device = fleet_setup["device"]
        resp = fleet_setup["client"].get(f"/api/fleet/devices/{device.device_id}/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["name"] == "RPi-001"
        assert "ota_history" in data
        assert "metrics_24h" in data

    def test_retrieve_includes_ota_history(self, fleet_setup):
        DeviceOTAJobFactory(
            edge_device=fleet_setup["device"],
            status=DeviceOTAJob.Status.SUCCESS,
        )
        device = fleet_setup["device"]
        resp = fleet_setup["client"].get(f"/api/fleet/devices/{device.device_id}/")
        data = resp.json()
        assert len(data["ota_history"]) == 1

    def test_retrieve_other_org_device_404(self, fleet_setup):
        other_org = OrganizationFactory(name="OtherOrg", slug="other-org-2")
        other_device = EdgeDeviceFactory(organization=other_org, name="RPi-Other")
        resp = fleet_setup["client"].get(f"/api/fleet/devices/{other_device.device_id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# OTA lifecycle tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOTATriggerAPI:
    """Tests for POST /api/fleet/devices/{device_id}/update/."""

    def test_trigger_update_creates_job(self, fleet_setup):
        device = fleet_setup["device"]
        firmware = fleet_setup["firmware_new"]
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/update/",
            {"firmware_release_id": firmware.pk},
        )
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["status"] == "PENDING"
        assert data["previous_version"] == "3.1.0"

    def test_trigger_update_missing_firmware_id(self, fleet_setup):
        device = fleet_setup["device"]
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/update/",
            {},
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_trigger_update_conflict_active_job(self, fleet_setup):
        device = fleet_setup["device"]
        firmware = fleet_setup["firmware_new"]
        DeviceOTAJobFactory(
            edge_device=device,
            firmware_release=firmware,
            status=DeviceOTAJob.Status.DOWNLOADING,
        )
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/update/",
            {"firmware_release_id": firmware.pk},
        )
        assert resp.status_code == status.HTTP_409_CONFLICT

    def test_trigger_update_inactive_firmware_404(self, fleet_setup):
        device = fleet_setup["device"]
        inactive_fw = FirmwareReleaseFactory(version="9.9.9", is_active=False)
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/update/",
            {"firmware_release_id": inactive_fw.pk},
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestOTARollbackAPI:
    """Tests for POST /api/fleet/devices/{device_id}/rollback/."""

    def test_rollback_success(self, fleet_setup):
        device = fleet_setup["device"]
        firmware_old = fleet_setup["firmware_old"]
        # Create a completed successful OTA job
        DeviceOTAJobFactory(
            edge_device=device,
            firmware_release=fleet_setup["firmware_new"],
            status=DeviceOTAJob.Status.SUCCESS,
            previous_version="3.1.0",
            completed_at=timezone.now(),
        )
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/rollback/",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["status"] == "PENDING"
        # The rollback targets the old firmware version
        assert data["firmware_version"] == firmware_old.version

    def test_rollback_no_previous_version(self, fleet_setup):
        device = fleet_setup["device"]
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/rollback/",
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_rollback_conflict_active_job(self, fleet_setup):
        device = fleet_setup["device"]
        DeviceOTAJobFactory(
            edge_device=device,
            firmware_release=fleet_setup["firmware_new"],
            status=DeviceOTAJob.Status.SUCCESS,
            previous_version="3.1.0",
            completed_at=timezone.now(),
        )
        # Create an active job blocking rollback
        DeviceOTAJobFactory(
            edge_device=device,
            status=DeviceOTAJob.Status.INSTALLING,
        )
        resp = fleet_setup["client"].post(
            f"/api/fleet/devices/{device.device_id}/rollback/",
        )
        assert resp.status_code == status.HTTP_409_CONFLICT


# ---------------------------------------------------------------------------
# Firmware release API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestFirmwareReleaseAPI:
    """Tests for /api/fleet/firmware/ endpoints."""

    def test_list_firmware(self, fleet_setup):
        resp = fleet_setup["client"].get("/api/fleet/firmware/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        # 2 firmware releases from fleet_setup
        assert len(data["results"]) == 2

    def test_create_firmware(self, fleet_setup):
        resp = fleet_setup["client"].post(
            "/api/fleet/firmware/",
            {
                "version": "4.0.0",
                "channel": "STABLE",
                "binary_url": "https://releases.example.com/v4.0.0.bin",
                "checksum_sha256": "b" * 64,
                "file_size_bytes": 2097152,
                "release_notes": "Major update",
            },
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["version"] == "4.0.0"

    def test_create_firmware_invalid_version(self, fleet_setup):
        resp = fleet_setup["client"].post(
            "/api/fleet/firmware/",
            {
                "version": "not-semver",
                "channel": "STABLE",
                "binary_url": "https://example.com/fw.bin",
                "checksum_sha256": "c" * 64,
                "file_size_bytes": 100,
            },
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_firmware_invalid_checksum(self, fleet_setup):
        resp = fleet_setup["client"].post(
            "/api/fleet/firmware/",
            {
                "version": "5.0.0",
                "channel": "STABLE",
                "binary_url": "https://example.com/fw.bin",
                "checksum_sha256": "not-a-hash",
                "file_size_bytes": 100,
            },
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_firmware(self, fleet_setup):
        fw = fleet_setup["firmware_new"]
        resp = fleet_setup["client"].get(f"/api/fleet/firmware/{fw.pk}/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["version"] == fw.version

    def test_filter_by_channel(self, fleet_setup):
        FirmwareReleaseFactory(version="3.3.0-beta", channel=FirmwareRelease.Channel.BETA)
        resp = fleet_setup["client"].get("/api/fleet/firmware/?channel=BETA")
        data = resp.json()
        assert all(r["channel"] == "BETA" for r in data["results"])


# ---------------------------------------------------------------------------
# Celery task tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCheckOTATimeout:
    """Tests for the check_ota_timeout Celery task."""

    def test_timeout_stuck_jobs(self):
        from apps.iot.tasks import check_ota_timeout

        job = DeviceOTAJobFactory(
            status=DeviceOTAJob.Status.DOWNLOADING,
            started_at=timezone.now() - timedelta(minutes=45),
        )
        result = check_ota_timeout()
        assert result["timed_out"] == 1
        job.refresh_from_db()
        assert job.status == DeviceOTAJob.Status.FAILED
        assert "timed out" in job.error_message

    def test_no_timeout_recent_jobs(self):
        from apps.iot.tasks import check_ota_timeout

        DeviceOTAJobFactory(
            status=DeviceOTAJob.Status.DOWNLOADING,
            started_at=timezone.now() - timedelta(minutes=5),
        )
        result = check_ota_timeout()
        assert result["timed_out"] == 0

    def test_no_timeout_completed_jobs(self):
        from apps.iot.tasks import check_ota_timeout

        DeviceOTAJobFactory(
            status=DeviceOTAJob.Status.SUCCESS,
            started_at=timezone.now() - timedelta(minutes=45),
        )
        result = check_ota_timeout()
        assert result["timed_out"] == 0

    def test_timeout_installing_jobs(self):
        from apps.iot.tasks import check_ota_timeout

        job = DeviceOTAJobFactory(
            status=DeviceOTAJob.Status.INSTALLING,
            started_at=timezone.now() - timedelta(minutes=35),
        )
        result = check_ota_timeout()
        assert result["timed_out"] == 1
        job.refresh_from_db()
        assert job.status == DeviceOTAJob.Status.FAILED


@pytest.mark.django_db
class TestCollectDeviceMetrics:
    """Tests for the collect_device_metrics Celery task."""

    def test_collect_metrics_success(self):
        from apps.iot.tasks import collect_device_metrics

        device = EdgeDeviceFactory()
        payload = {
            "cpu_percent": 67.5,
            "memory_percent": 48.2,
            "disk_percent": 76.0,
            "cpu_temperature": 52.0,
            "uptime_seconds": 1234567,
            "network_latency_ms": 34.0,
        }
        result = collect_device_metrics(str(device.device_id), payload)
        assert result["status"] == "ok"
        assert "device_metrics_id" in result

        m = DeviceMetrics.objects.get(pk=result["device_metrics_id"])
        assert m.cpu_percent == 67.5
        assert m.memory_percent == 48.2

    def test_collect_metrics_unknown_device(self):
        from apps.iot.tasks import collect_device_metrics

        result = collect_device_metrics("00000000-0000-0000-0000-000000000000", {})
        assert result["status"] == "error"
        assert result["reason"] == "device_not_found"

    def test_collect_metrics_inactive_device(self):
        from apps.iot.tasks import collect_device_metrics

        device = EdgeDeviceFactory(is_active=False)
        result = collect_device_metrics(str(device.device_id), {"cpu_percent": 50})
        assert result["status"] == "error"
