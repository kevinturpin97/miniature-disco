"""
Cloud CRM & Edge Sync API views — Sprint 28.

Edge endpoints (no JWT — HMAC authentication):
    POST /api/edge/register/   — register a Raspberry Pi, returns device_id + secret_key
    POST /api/edge/sync/       — receive a batch of records from an edge device
    GET  /api/edge/config/     — return configuration pushed from cloud to edge

CRM endpoints (JWT, staff/operator only):
    GET  /api/crm/tenants/              — list all client orgs with stats
    GET  /api/crm/tenants/{id}/         — detail for a single client
    GET  /api/crm/tenants/{id}/health/  — health snapshot (sync, devices, alerts)
    GET  /api/crm/stats/                — global platform metrics
    POST /api/crm/tenants/{id}/impersonate/ — issue a 30-min impersonation token
"""

from __future__ import annotations

import gzip
import hashlib
import hmac
import json
import logging
import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.iot.models import Alert, EdgeDevice, SensorReading, SyncBatch
from .models import CloudTenant, ImpersonationToken, Membership, Organization

logger = logging.getLogger(__name__)
User = get_user_model()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_IMPERSONATE_LIFETIME_MINUTES = 30


def _verify_hmac(device: EdgeDevice, body: bytes, signature: str) -> bool:
    """Verify the HMAC-SHA256 signature on a sync request.

    Args:
        device: The EdgeDevice whose secret_key is used.
        body: Raw (compressed) request body.
        signature: Hex digest from the X-Signature header.

    Returns:
        True if the computed digest matches the provided signature.
    """
    expected = hmac.new(device.secret_key.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _resolve_device(device_id: str) -> EdgeDevice | None:
    """Return the EdgeDevice for a given device_id UUID string, or None."""
    import uuid as _uuid
    try:
        _uuid.UUID(device_id)  # Validate format before hitting the DB
    except (ValueError, AttributeError):
        return None
    try:
        return EdgeDevice.objects.get(device_id=device_id, is_active=True)
    except EdgeDevice.DoesNotExist:
        return None


def _generate_secret() -> str:
    """Generate a random 32-byte hex secret for HMAC signing."""
    return secrets.token_hex(32)


# ---------------------------------------------------------------------------
# Edge — Register
# ---------------------------------------------------------------------------


class EdgeRegisterView(APIView):
    """Register a new Raspberry Pi edge device.

    POST /api/edge/register/

    Requires JWT authentication from a member with ADMIN or OWNER role.
    Returns the generated device_id and secret_key (shown once — store securely).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        org_slug = request.data.get("org_slug")
        name = request.data.get("name", "").strip()

        if not org_slug or not name:
            return Response(
                {"detail": "org_slug and name are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            org = Organization.objects.get(slug=org_slug)
        except Organization.DoesNotExist:
            return Response(
                {"detail": "Organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only ADMIN or OWNER may register a device
        try:
            membership = Membership.objects.get(user=request.user, organization=org)
        except Membership.DoesNotExist:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if membership.role not in (Membership.Role.ADMIN, Membership.Role.OWNER):
            return Response(
                {"detail": "Only ADMIN or OWNER may register edge devices."},
                status=status.HTTP_403_FORBIDDEN,
            )

        secret = _generate_secret()
        device = EdgeDevice.objects.create(
            organization=org,
            name=name,
            secret_key=secret,
        )

        # Link to CloudTenant if it exists
        tenant, _ = CloudTenant.objects.get_or_create(organization=org)
        tenant.edge_devices.add(device)

        logger.info("Registered edge device %s for org %s", device.device_id, org.slug)

        return Response(
            {
                "device_id": str(device.device_id),
                "name": device.name,
                "secret_key": secret,
                "warning": "Store the secret_key securely — it will not be shown again.",
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Edge — Sync (receive batch from Raspberry Pi)
# ---------------------------------------------------------------------------


class EdgeSyncView(APIView):
    """Receive a sync batch from an edge device.

    POST /api/edge/sync/

    Authentication: HMAC-SHA256 via X-Device-ID and X-Signature headers.
    Body: gzip-compressed JSON payload produced by the edge sync agent.

    The payload is validated and records are inserted synchronously (small
    batches) or queued via Celery (large batches / cloud mode).
    """

    permission_classes = []  # HMAC auth — no JWT

    def post(self, request: Request) -> Response:
        device_id = request.headers.get("X-Device-ID", "")
        signature = request.headers.get("X-Signature", "")

        if not device_id or not signature:
            return Response(
                {"detail": "X-Device-ID and X-Signature headers are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device = _resolve_device(device_id)
        if device is None:
            return Response(
                {"detail": "Unknown or inactive device."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Read raw body for HMAC verification
        raw_body = request.body

        if not _verify_hmac(device, raw_body, signature):
            logger.warning("HMAC verification failed for device %s", device_id)
            return Response(
                {"detail": "Invalid signature."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Decompress
        content_encoding = request.headers.get("Content-Encoding", "")
        try:
            if content_encoding == "gzip":
                body_bytes = gzip.decompress(raw_body)
            else:
                body_bytes = raw_body
            payload = json.loads(body_bytes.decode())
        except Exception as exc:
            logger.warning("Failed to decode sync payload from %s: %s", device_id, exc)
            return Response(
                {"detail": "Invalid payload encoding."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Record batch
        readings = payload.get("readings", [])
        commands = payload.get("commands", [])
        alerts = payload.get("alerts", [])
        audit_events = payload.get("audit_events", [])
        total = len(readings) + len(commands) + len(alerts) + len(audit_events)

        payload_kb = len(raw_body) / 1024
        batch = SyncBatch.objects.create(
            edge_device=device,
            status=SyncBatch.Status.PENDING,
            records_count=total,
            payload_size_kb=round(payload_kb, 2),
        )

        # Ingest via Celery task
        from apps.iot.tasks import ingest_sync_batch  # lazy import
        ingest_sync_batch.apply_async(
            args=[batch.id, payload],
            queue=getattr(settings, "CLOUD_SYNC_INGEST_QUEUE", "sync_ingest"),
        )

        # Update tenant last_activity
        CloudTenant.objects.filter(organization=device.organization).update(
            last_activity=timezone.now()
        )
        device.last_sync_at = timezone.now()
        device.save(update_fields=["last_sync_at"])

        logger.info(
            "Received sync batch %d from device %s: %d records (%.1f KB)",
            batch.id, device_id, total, payload_kb,
        )

        return Response(
            {"batch_id": batch.id, "records_received": total, "status": "queued"},
            status=status.HTTP_202_ACCEPTED,
        )


# ---------------------------------------------------------------------------
# Edge — Config push
# ---------------------------------------------------------------------------


class EdgeConfigView(APIView):
    """Return configuration for an edge device (thresholds, schedules, rules).

    GET /api/edge/config/

    Authentication: HMAC-SHA256 via X-Device-ID and X-Signature headers.
    Returns serialized sensor thresholds, automation rules, and schedule settings.
    """

    permission_classes = []  # HMAC auth

    def get(self, request: Request) -> Response:
        device_id = request.headers.get("X-Device-ID", "")
        signature = request.headers.get("X-Signature", "")

        if not device_id or not signature:
            return Response(
                {"detail": "X-Device-ID and X-Signature headers are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        device = _resolve_device(device_id)
        if device is None:
            return Response(
                {"detail": "Unknown or inactive device."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # For GET requests, sign the device_id to verify identity
        challenge = device_id.encode()
        if not _verify_hmac(device, challenge, signature):
            return Response(
                {"detail": "Invalid signature."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.iot.models import AutomationRule, Sensor
        org = device.organization

        # Collect sensors for all greenhouses of this org
        sensors = (
            Sensor.objects.filter(
                zone__greenhouse__organization=org,
                is_active=True,
            )
            .select_related("zone__greenhouse")
            .values(
                "id",
                "sensor_type",
                "label",
                "unit",
                "min_threshold",
                "max_threshold",
                "zone_id",
                "zone__relay_id",
            )
        )

        rules = (
            AutomationRule.objects.filter(
                zone__greenhouse__organization=org,
                is_active=True,
            )
            .select_related("zone", "action_actuator")
            .values(
                "id",
                "name",
                "sensor_type",
                "condition",
                "threshold_value",
                "action_actuator__gpio_pin",
                "action_command_type",
                "action_value",
                "cooldown_seconds",
            )
        )

        return Response(
            {
                "device_id": str(device.device_id),
                "org_slug": org.slug,
                "sensors": list(sensors),
                "automation_rules": list(rules),
                "config_version": int(org.updated_at.timestamp()),
            }
        )


# ---------------------------------------------------------------------------
# CRM — permission helpers
# ---------------------------------------------------------------------------


def _is_operator(user) -> bool:
    """Return True if the user is a Django staff member (operator)."""
    return user.is_staff or user.is_superuser


class IsOperator(IsAdminUser):
    """Allow access to Django staff/superusers acting as platform operators."""

    message = "Only platform operators can access the CRM."


# ---------------------------------------------------------------------------
# CRM — Tenant list
# ---------------------------------------------------------------------------


class CRMTenantListView(APIView):
    """List all client organizations with summary statistics.

    GET /api/crm/tenants/

    Restricted to platform operators (is_staff=True).
    """

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request: Request) -> Response:
        tenants = (
            CloudTenant.objects.select_related("organization")
            .prefetch_related("edge_devices")
            .order_by("-last_activity")
        )

        data = []
        for tenant in tenants:
            org = tenant.organization
            gh_count = getattr(org, "_greenhouse_count", None)
            if gh_count is None:
                from apps.iot.models import Greenhouse
                gh_count = Greenhouse.objects.filter(organization=org).count()

            unsynced = SensorReading.objects.filter(
                sensor__zone__greenhouse__organization=org,
                cloud_synced=False,
            ).count()

            data.append(
                {
                    "id": tenant.id,
                    "org_id": org.id,
                    "org_slug": org.slug,
                    "org_name": org.name,
                    "plan": org.plan,
                    "is_on_trial": org.is_on_trial,
                    "greenhouse_count": gh_count,
                    "device_count": tenant.edge_devices.count(),
                    "cloud_storage_mb": tenant.cloud_storage_mb,
                    "last_activity": tenant.last_activity,
                    "unsynced_readings": unsynced,
                    "is_active": tenant.is_active,
                }
            )

        return Response(data)


# ---------------------------------------------------------------------------
# CRM — Tenant detail
# ---------------------------------------------------------------------------


class CRMTenantDetailView(APIView):
    """Return detailed information for a single client organization.

    GET /api/crm/tenants/{id}/

    Restricted to platform operators.
    """

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request: Request, tenant_id: int) -> Response:
        try:
            tenant = CloudTenant.objects.select_related("organization").get(id=tenant_id)
        except CloudTenant.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        org = tenant.organization
        from apps.iot.models import Alert, Command, Greenhouse, Zone

        greenhouses = list(
            Greenhouse.objects.filter(organization=org, is_active=True).values("id", "name", "location")
        )
        zones = list(
            Zone.objects.filter(greenhouse__organization=org, is_active=True).values(
                "id", "name", "last_seen", "relay_id"
            )
        )
        devices = list(
            tenant.edge_devices.values(
                "device_id", "name", "firmware_version", "last_sync_at", "is_active"
            )
        )
        recent_alerts = list(
            Alert.objects.filter(zone__greenhouse__organization=org)
            .order_by("-created_at")[:10]
            .values("id", "alert_type", "severity", "message", "is_acknowledged", "created_at")
        )
        sync_batches = list(
            SyncBatch.objects.filter(edge_device__organization=org)
            .order_by("-started_at")[:20]
            .values("id", "status", "records_count", "payload_size_kb", "retry_count", "started_at", "completed_at")
        )
        members = list(
            Membership.objects.filter(organization=org).values(
                "user__username", "user__email", "role", "joined_at"
            )
        )

        return Response(
            {
                "tenant": {
                    "id": tenant.id,
                    "org_id": org.id,
                    "org_slug": org.slug,
                    "org_name": org.name,
                    "plan": org.plan,
                    "cloud_storage_mb": tenant.cloud_storage_mb,
                    "last_activity": tenant.last_activity,
                    "support_notes": tenant.support_notes,
                    "is_active": tenant.is_active,
                    "created_at": tenant.created_at,
                },
                "greenhouses": greenhouses,
                "zones": zones,
                "devices": devices,
                "recent_alerts": recent_alerts,
                "sync_batches": sync_batches,
                "members": members,
            }
        )

    def patch(self, request: Request, tenant_id: int) -> Response:
        """Update support_notes or plan (operator only)."""
        try:
            tenant = CloudTenant.objects.select_related("organization").get(id=tenant_id)
        except CloudTenant.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if "support_notes" in request.data:
            tenant.support_notes = request.data["support_notes"]
            tenant.save(update_fields=["support_notes"])

        if "plan" in request.data:
            new_plan = request.data["plan"]
            if new_plan not in dict(Organization.Plan.choices):
                return Response(
                    {"detail": f"Invalid plan. Choices: {list(Organization.Plan.choices)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            tenant.organization.plan = new_plan
            tenant.organization.save(update_fields=["plan"])

        return Response({"detail": "Updated."})


# ---------------------------------------------------------------------------
# CRM — Tenant health
# ---------------------------------------------------------------------------


class CRMTenantHealthView(APIView):
    """Return a health snapshot for a single client.

    GET /api/crm/tenants/{id}/health/

    Checks: last sync age, device online status, recent alerts.
    """

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request: Request, tenant_id: int) -> Response:
        try:
            tenant = CloudTenant.objects.select_related("organization").get(id=tenant_id)
        except CloudTenant.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        org = tenant.organization

        devices_status = []
        for device in tenant.edge_devices.all():
            if device.last_sync_at is None:
                sync_age_hours = None
                is_online = False
            else:
                sync_age_hours = round((now - device.last_sync_at).total_seconds() / 3600, 1)
                is_online = sync_age_hours < 1  # online = synced within last hour

            devices_status.append(
                {
                    "device_id": str(device.device_id),
                    "name": device.name,
                    "last_sync_at": device.last_sync_at,
                    "sync_age_hours": sync_age_hours,
                    "is_online": is_online,
                }
            )

        # Unacknowledged critical alerts in the last 24h
        critical_alerts = Alert.objects.filter(
            zone__greenhouse__organization=org,
            severity=Alert.Severity.CRITICAL,
            is_acknowledged=False,
            created_at__gte=now - timedelta(hours=24),
        ).count()

        # Failed sync batches
        failed_batches = SyncBatch.objects.filter(
            edge_device__organization=org,
            status=SyncBatch.Status.FAILED,
        ).count()

        # Unsynced readings backlog
        unsynced = SensorReading.objects.filter(
            sensor__zone__greenhouse__organization=org,
            cloud_synced=False,
        ).count()

        all_online = all(d["is_online"] for d in devices_status) if devices_status else False
        health_status = "ok"
        if not all_online or failed_batches > 0:
            health_status = "degraded"
        if critical_alerts > 0:
            health_status = "critical"

        return Response(
            {
                "org_slug": org.slug,
                "health_status": health_status,
                "devices": devices_status,
                "critical_alerts_24h": critical_alerts,
                "failed_sync_batches": failed_batches,
                "unsynced_readings_backlog": unsynced,
                "last_activity": tenant.last_activity,
            }
        )


# ---------------------------------------------------------------------------
# CRM — Global stats
# ---------------------------------------------------------------------------


class CRMStatsView(APIView):
    """Return global platform metrics for the CRM dashboard.

    GET /api/crm/stats/

    Restricted to platform operators.
    """

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request: Request) -> Response:
        from apps.iot.models import Greenhouse, Zone

        now = timezone.now()
        day_ago = now - timedelta(hours=24)

        total_tenants = CloudTenant.objects.count()
        active_tenants = CloudTenant.objects.filter(is_active=True).count()
        total_greenhouses = Greenhouse.objects.count()
        total_zones = Zone.objects.count()
        total_devices = EdgeDevice.objects.count()
        active_devices = EdgeDevice.objects.filter(
            is_active=True,
            last_sync_at__gte=now - timedelta(hours=1),
        ).count()

        readings_24h = SensorReading.objects.filter(received_at__gte=day_ago).count()
        alerts_24h = Alert.objects.filter(created_at__gte=day_ago).count()
        critical_alerts_unack = Alert.objects.filter(
            severity=Alert.Severity.CRITICAL,
            is_acknowledged=False,
        ).count()

        syncs_24h = SyncBatch.objects.filter(started_at__gte=day_ago).count()
        failed_syncs_24h = SyncBatch.objects.filter(
            started_at__gte=day_ago, status=SyncBatch.Status.FAILED
        ).count()

        plan_dist: dict[str, int] = {}
        for org in Organization.objects.all():
            plan_dist[org.plan] = plan_dist.get(org.plan, 0) + 1

        return Response(
            {
                "total_tenants": total_tenants,
                "active_tenants": active_tenants,
                "total_greenhouses": total_greenhouses,
                "total_zones": total_zones,
                "total_devices": total_devices,
                "active_devices_1h": active_devices,
                "readings_last_24h": readings_24h,
                "alerts_last_24h": alerts_24h,
                "critical_alerts_unacknowledged": critical_alerts_unack,
                "sync_batches_24h": syncs_24h,
                "failed_syncs_24h": failed_syncs_24h,
                "plan_distribution": plan_dist,
            }
        )


# ---------------------------------------------------------------------------
# CRM — Impersonate
# ---------------------------------------------------------------------------


class CRMImpersonateView(APIView):
    """Issue a short-lived impersonation token for a client organization.

    POST /api/crm/tenants/{id}/impersonate/

    Returns a temporary JWT (30 min) scoped to an ADMIN user of the target org.
    Restricted to platform operators.
    """

    permission_classes = [IsAuthenticated, IsOperator]

    def post(self, request: Request, tenant_id: int) -> Response:
        try:
            tenant = CloudTenant.objects.select_related("organization").get(id=tenant_id)
        except CloudTenant.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        org = tenant.organization

        # Find the OWNER of the target org to impersonate
        owner_membership = (
            Membership.objects.filter(organization=org, role=Membership.Role.OWNER)
            .select_related("user")
            .first()
        )
        if owner_membership is None:
            return Response(
                {"detail": "No owner found for this organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_user = owner_membership.user
        expiry = timezone.now() + timedelta(minutes=_IMPERSONATE_LIFETIME_MINUTES)

        # Generate short-lived JWT
        refresh = RefreshToken.for_user(target_user)
        refresh.set_exp(lifetime=timedelta(minutes=_IMPERSONATE_LIFETIME_MINUTES))
        access_token = refresh.access_token
        access_token.set_exp(lifetime=timedelta(minutes=_IMPERSONATE_LIFETIME_MINUTES))

        # Store token record (hashed) for audit
        raw_token = str(access_token)
        token_record = ImpersonationToken.objects.create(
            organization=org,
            created_by=request.user,
            token=hashlib.sha256(raw_token.encode()).hexdigest(),
            expires_at=expiry,
        )

        logger.warning(
            "Impersonation token issued: operator=%s, target_org=%s, token_id=%d",
            request.user.username,
            org.slug,
            token_record.id,
        )

        return Response(
            {
                "access": raw_token,
                "expires_at": expiry.isoformat(),
                "target_user": target_user.username,
                "target_org": org.slug,
                "note": "This token grants full access to the target org. Expires in 30 minutes.",
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# CRM — CSV export of tenant list
# ---------------------------------------------------------------------------


class CRMTenantExportCSVView(APIView):
    """Export the list of all tenants as a CSV file.

    GET /api/crm/tenants/export/csv/

    Restricted to platform operators.
    """

    permission_classes = [IsAuthenticated, IsOperator]

    def get(self, request: Request) -> Response:
        import csv
        import io

        tenants = CloudTenant.objects.select_related("organization").order_by("organization__name")

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "org_name",
                "org_slug",
                "plan",
                "cloud_storage_mb",
                "last_activity",
                "device_count",
                "is_active",
            ]
        )
        for t in tenants:
            writer.writerow(
                [
                    t.organization.name,
                    t.organization.slug,
                    t.organization.plan,
                    t.cloud_storage_mb,
                    t.last_activity.isoformat() if t.last_activity else "",
                    t.edge_devices.count(),
                    t.is_active,
                ]
            )

        from django.http import HttpResponse

        response = HttpResponse(buf.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="tenants.csv"'
        return response
