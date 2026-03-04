"""
ViewSets for IoT models in the Greenhouse SaaS API.

All ViewSets enforce organization membership: a user can only access resources
belonging to greenhouses owned by organizations they are a member of.
"""

import csv
from datetime import datetime

from django.db.models import Avg
from django.db.models.functions import TruncDay, TruncHour
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone as django_tz
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.api.models import Membership, Organization

from .models import (
    Actuator,
    Alert,
    AutomationRule,
    Command,
    Greenhouse,
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    Scenario,
    Schedule,
    Sensor,
    SensorReading,
    Zone,
)
from .serializers import (
    ActuatorSerializer,
    AlertSerializer,
    AutomationRuleSerializer,
    CommandSerializer,
    GreenhouseSerializer,
    NotificationChannelSerializer,
    NotificationLogSerializer,
    NotificationRuleSerializer,
    ScenarioSerializer,
    ScheduleSerializer,
    SensorReadingSerializer,
    SensorSerializer,
    ZoneSerializer,
)


def _user_org_ids(user) -> list[int]:
    """Return the list of organization IDs the user is a member of."""
    return list(
        Membership.objects.filter(user=user).values_list("organization_id", flat=True)
    )


class GreenhouseViewSet(viewsets.ModelViewSet):
    """CRUD operations for Greenhouse resources within the user's organizations.

    Endpoints:
        GET    /api/greenhouses/       - List all greenhouses.
        POST   /api/greenhouses/       - Create a greenhouse.
        GET    /api/greenhouses/{id}/  - Retrieve a greenhouse.
        PATCH  /api/greenhouses/{id}/  - Partially update a greenhouse.
        DELETE /api/greenhouses/{id}/  - Delete a greenhouse.
    """

    serializer_class = GreenhouseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "location"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        """Return greenhouses belonging to the user's organizations."""
        org_ids = _user_org_ids(self.request.user)
        return (
            Greenhouse.objects
            .filter(organization_id__in=org_ids)
            .prefetch_related("zones")
        )

    def perform_create(self, serializer: GreenhouseSerializer) -> None:
        """Set organization from request header or user's first org, with quota check."""
        org = self._resolve_organization()
        self._check_greenhouse_quota(org)
        serializer.save(organization=org, owner=self.request.user)

    def _resolve_organization(self) -> Organization:
        """Resolve the target organization from X-Organization header or default."""
        org_slug = self.request.headers.get("X-Organization")
        memberships = Membership.objects.filter(user=self.request.user).select_related("organization")

        if org_slug:
            membership = memberships.filter(organization__slug=org_slug).first()
            if not membership:
                raise serializers.ValidationError({"organization": "You are not a member of this organization."})
            if membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.OPERATOR]:
                raise serializers.ValidationError({"organization": "Insufficient role to create resources."})
            return membership.organization

        # Default to first org where user has OPERATOR+ role
        membership = (
            memberships
            .filter(role__in=[Membership.Role.OWNER, Membership.Role.ADMIN, Membership.Role.OPERATOR])
            .first()
        )
        if not membership:
            raise serializers.ValidationError({"organization": "No organization found. Create one first."})
        return membership.organization

    def _check_greenhouse_quota(self, org: Organization) -> None:
        """Raise 403 if the org has reached its greenhouse limit."""
        limit = org.max_greenhouses
        if limit == 0:  # unlimited
            return
        current = Greenhouse.objects.filter(organization=org).count()
        if current >= limit:
            raise serializers.ValidationError({
                "organization": f"Greenhouse limit reached ({limit}) for plan {org.plan}. Upgrade to add more."
            })


class ZoneViewSet(viewsets.ModelViewSet):
    """CRUD operations for Zone resources, optionally nested under a Greenhouse.

    Endpoints:
        GET    /api/greenhouses/{greenhouse_id}/zones/  - List zones.
        POST   /api/greenhouses/{greenhouse_id}/zones/  - Create a zone.
        GET    /api/zones/{id}/                          - Retrieve a zone.
        PATCH  /api/zones/{id}/                          - Partially update a zone.
        DELETE /api/zones/{id}/                          - Delete a zone.
    """

    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_greenhouse(self):
        """Return the parent Greenhouse for nested routes, verifying membership."""
        greenhouse_id = self.kwargs.get("greenhouse_id")
        if greenhouse_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Greenhouse, pk=greenhouse_id, organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        """Return zones filtered by parent greenhouse or by membership chain."""
        greenhouse = self._get_greenhouse()
        if greenhouse:
            return Zone.objects.filter(greenhouse=greenhouse).select_related("greenhouse")
        org_ids = _user_org_ids(self.request.user)
        return (
            Zone.objects
            .filter(greenhouse__organization_id__in=org_ids)
            .select_related("greenhouse")
        )

    def perform_create(self, serializer: ZoneSerializer) -> None:
        """Inject the parent greenhouse and check zone quota before saving."""
        greenhouse = self._get_greenhouse()
        if not greenhouse:
            raise serializers.ValidationError({"greenhouse": "Greenhouse ID is required."})
        org = greenhouse.organization
        if org:
            limit = org.max_zones
            if limit > 0:
                current = Zone.objects.filter(greenhouse__organization=org).count()
                if current >= limit:
                    raise serializers.ValidationError({
                        "zone": f"Zone limit reached ({limit}) for plan {org.plan}. Upgrade to add more."
                    })
        serializer.save(greenhouse=greenhouse)

    @action(detail=True, methods=["get"], url_path="export/csv")
    def export_csv(self, request: Request, pk: int = None, **kwargs) -> HttpResponse:
        """Export all sensor readings for a zone as a CSV file."""
        zone = self.get_object()
        readings = (
            SensorReading.objects
            .filter(sensor__zone=zone)
            .select_related("sensor")
            .order_by("received_at")
        )

        from_dt = request.query_params.get("from")
        to_dt = request.query_params.get("to")

        if from_dt:
            try:
                readings = readings.filter(received_at__gte=datetime.fromisoformat(from_dt))
            except ValueError:
                raise serializers.ValidationError({"from": "Invalid ISO 8601 datetime."})

        if to_dt:
            try:
                readings = readings.filter(received_at__lte=datetime.fromisoformat(to_dt))
            except ValueError:
                raise serializers.ValidationError({"to": "Invalid ISO 8601 datetime."})

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="zone_{zone.pk}_readings.csv"'

        writer = csv.writer(response)
        writer.writerow(["sensor_type", "sensor_label", "value", "unit", "received_at"])

        for reading in readings.iterator():
            writer.writerow([
                reading.sensor.sensor_type,
                reading.sensor.label,
                reading.value,
                reading.sensor.unit,
                reading.received_at.isoformat(),
            ])

        return response


class SensorViewSet(viewsets.ModelViewSet):
    """CRUD operations for Sensor resources, optionally nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/sensors/  - List sensors.
        POST   /api/zones/{zone_id}/sensors/  - Create a sensor.
        PATCH  /api/sensors/{id}/              - Partially update a sensor.
        DELETE /api/sensors/{id}/              - Delete a sensor.
        GET    /api/sensors/{id}/readings/     - List readings with time filters.
    """

    serializer_class = SensorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["label", "sensor_type"]
    ordering_fields = ["sensor_type", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_zone(self):
        """Return the parent Zone for nested routes, verifying membership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        """Return sensors filtered by parent zone or by membership chain."""
        zone = self._get_zone()
        if zone:
            return Sensor.objects.filter(zone=zone).select_related("zone")
        org_ids = _user_org_ids(self.request.user)
        return (
            Sensor.objects
            .filter(zone__greenhouse__organization_id__in=org_ids)
            .select_related("zone")
        )

    def perform_create(self, serializer: SensorSerializer) -> None:
        """Inject the parent zone before saving."""
        zone = self._get_zone()
        if not zone:
            raise serializers.ValidationError({"zone": "Zone ID is required."})
        serializer.save(zone=zone)

    @action(detail=True, methods=["get"], url_path="readings")
    def readings(self, request: Request, pk: int = None, **kwargs) -> Response:
        """List sensor readings with optional time range and aggregation.

        Query params:
            from (ISO 8601 datetime): Filter readings after this timestamp.
            to   (ISO 8601 datetime): Filter readings before this timestamp.
            interval (str): Aggregate readings — ``hour`` or ``day``.
                Returns ``{"period", "avg_value"}`` instead of raw readings.
        """
        sensor = self.get_object()
        qs = SensorReading.objects.filter(sensor=sensor).order_by("-received_at")

        from_dt = request.query_params.get("from")
        to_dt = request.query_params.get("to")
        interval = request.query_params.get("interval")

        if from_dt:
            try:
                qs = qs.filter(received_at__gte=datetime.fromisoformat(from_dt))
            except ValueError:
                raise serializers.ValidationError({"from": "Invalid ISO 8601 datetime."})

        if to_dt:
            try:
                qs = qs.filter(received_at__lte=datetime.fromisoformat(to_dt))
            except ValueError:
                raise serializers.ValidationError({"to": "Invalid ISO 8601 datetime."})

        # Aggregation mode
        if interval in ("hour", "day"):
            trunc_fn = TruncHour if interval == "hour" else TruncDay
            aggregated = (
                qs.annotate(period=trunc_fn("received_at"))
                .values("period")
                .annotate(avg_value=Avg("value"))
                .order_by("-period")
            )
            page = self.paginate_queryset(list(aggregated))
            if page is not None:
                return self.get_paginated_response(page)
            return Response(list(aggregated))
        elif interval is not None:
            raise serializers.ValidationError(
                {"interval": "Must be 'hour' or 'day'."}
            )

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(SensorReadingSerializer(page, many=True).data)

        return Response(SensorReadingSerializer(qs, many=True).data)


class ActuatorViewSet(viewsets.ModelViewSet):
    """CRUD operations for Actuator resources, optionally nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/actuators/  - List actuators.
        POST   /api/zones/{zone_id}/actuators/  - Create an actuator.
        PATCH  /api/actuators/{id}/              - Partially update an actuator.
        DELETE /api/actuators/{id}/              - Delete an actuator.
    """

    serializer_class = ActuatorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "actuator_type"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_zone(self):
        """Return the parent Zone for nested routes, verifying membership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        """Return actuators filtered by parent zone or by membership chain."""
        zone = self._get_zone()
        if zone:
            return Actuator.objects.filter(zone=zone).select_related("zone")
        org_ids = _user_org_ids(self.request.user)
        return (
            Actuator.objects
            .filter(zone__greenhouse__organization_id__in=org_ids)
            .select_related("zone")
        )

    def perform_create(self, serializer: ActuatorSerializer) -> None:
        """Inject the parent zone before saving."""
        zone = self._get_zone()
        if not zone:
            raise serializers.ValidationError({"zone": "Zone ID is required."})
        serializer.save(zone=zone)


class CommandViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Create and list Command resources.

    Endpoints:
        POST /api/actuators/{actuator_id}/commands/  - Issue a command to an actuator.
        GET  /api/zones/{zone_id}/commands/           - List all commands for a zone.
    """

    serializer_class = CommandSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "command_type"]
    ordering_fields = ["created_at"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        """Return commands filtered by actuator, zone, or membership chain."""
        org_ids = _user_org_ids(self.request.user)
        actuator_id = self.kwargs.get("actuator_id")
        zone_id = self.kwargs.get("zone_id")

        if actuator_id:
            actuator = get_object_or_404(
                Actuator, pk=actuator_id, zone__greenhouse__organization_id__in=org_ids
            )
            return Command.objects.filter(actuator=actuator).select_related("actuator")

        if zone_id:
            zone = get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
            return Command.objects.filter(actuator__zone=zone).select_related("actuator")

        return (
            Command.objects
            .filter(actuator__zone__greenhouse__organization_id__in=org_ids)
            .select_related("actuator")
        )

    def perform_create(self, serializer: CommandSerializer) -> None:
        """Inject the target actuator and verify membership before saving."""
        actuator_id = self.kwargs.get("actuator_id")
        if not actuator_id:
            raise serializers.ValidationError({"actuator": "Actuator ID is required."})
        org_ids = _user_org_ids(self.request.user)
        actuator = get_object_or_404(
            Actuator, pk=actuator_id, zone__greenhouse__organization_id__in=org_ids
        )
        serializer.save(actuator=actuator)


class AutomationRuleViewSet(viewsets.ModelViewSet):
    """CRUD operations for AutomationRule resources, nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/automations/  - List rules.
        POST   /api/zones/{zone_id}/automations/  - Create a rule.
        PATCH  /api/automations/{id}/              - Partially update a rule.
        DELETE /api/automations/{id}/              - Delete a rule.
    """

    serializer_class = AutomationRuleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "sensor_type"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_zone(self):
        """Return the parent Zone for nested routes, verifying membership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        """Return automation rules filtered by parent zone or by membership chain."""
        zone = self._get_zone()
        if zone:
            return (
                AutomationRule.objects
                .filter(zone=zone)
                .select_related("zone", "action_actuator")
            )
        org_ids = _user_org_ids(self.request.user)
        return (
            AutomationRule.objects
            .filter(zone__greenhouse__organization_id__in=org_ids)
            .select_related("zone", "action_actuator")
        )

    def perform_create(self, serializer: AutomationRuleSerializer) -> None:
        """Inject the parent zone before saving."""
        zone = self._get_zone()
        if not zone:
            raise serializers.ValidationError({"zone": "Zone ID is required."})
        serializer.save(zone=zone)


class AlertViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Read-only ViewSet for Alert resources with an acknowledge action.

    Endpoints:
        GET   /api/alerts/                   - List alerts (with filters).
        GET   /api/alerts/{id}/              - Retrieve an alert.
        PATCH /api/alerts/{id}/acknowledge/  - Acknowledge an alert.
    """

    serializer_class = AlertSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["zone", "severity", "is_acknowledged"]
    ordering_fields = ["created_at", "severity"]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        """Return alerts for greenhouses in the user's organizations."""
        org_ids = _user_org_ids(self.request.user)
        return (
            Alert.objects
            .filter(zone__greenhouse__organization_id__in=org_ids)
            .select_related("zone", "sensor")
        )

    @action(detail=True, methods=["patch"], url_path="acknowledge")
    def acknowledge(self, request: Request, pk: int = None) -> Response:
        """Acknowledge an alert."""
        alert = self.get_object()
        if alert.is_acknowledged:
            return Response(
                {"detail": "Alert is already acknowledged."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        alert.is_acknowledged = True
        alert.acknowledged_by = request.user
        alert.acknowledged_at = django_tz.now()
        alert.save(
            update_fields=["is_acknowledged", "acknowledged_by", "acknowledged_at"]
        )
        return Response(AlertSerializer(alert).data)


def _resolve_org_from_slug(request, slug: str) -> Organization:
    """Resolve an org by slug, verifying the user is a member.

    Args:
        request: The current DRF request.
        slug: The organization slug from the URL path.

    Returns:
        The Organization instance.

    Raises:
        Http404 if not found or user is not a member.
    """
    return get_object_or_404(
        Organization,
        slug=slug,
        memberships__user=request.user,
    )


class NotificationChannelViewSet(viewsets.ModelViewSet):
    """CRUD operations for notification channels scoped to an organization.

    Endpoints:
        GET    /api/orgs/{slug}/notifications/channels/       - List channels.
        POST   /api/orgs/{slug}/notifications/channels/       - Create a channel.
        GET    /api/orgs/{slug}/notifications/channels/{id}/  - Retrieve.
        PATCH  /api/orgs/{slug}/notifications/channels/{id}/  - Update.
        DELETE /api/orgs/{slug}/notifications/channels/{id}/  - Delete.
    """

    serializer_class = NotificationChannelSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_org(self) -> Organization:
        return _resolve_org_from_slug(self.request, self.kwargs["slug"])

    def get_queryset(self):
        org = self._get_org()
        return NotificationChannel.objects.filter(organization=org)

    def perform_create(self, serializer):
        org = self._get_org()
        # Only ADMIN+ can manage channels
        membership = Membership.objects.filter(user=self.request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can manage notification channels.")
        serializer.save(organization=org)

    def perform_update(self, serializer):
        org = self._get_org()
        membership = Membership.objects.filter(user=self.request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can manage notification channels.")
        serializer.save()

    def perform_destroy(self, instance):
        org = self._get_org()
        membership = Membership.objects.filter(user=self.request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can manage notification channels.")
        instance.delete()


class NotificationRuleViewSet(viewsets.ModelViewSet):
    """CRUD operations for notification rules scoped to an organization.

    Endpoints:
        GET    /api/orgs/{slug}/notifications/rules/       - List rules.
        POST   /api/orgs/{slug}/notifications/rules/       - Create a rule.
        GET    /api/orgs/{slug}/notifications/rules/{id}/  - Retrieve.
        PATCH  /api/orgs/{slug}/notifications/rules/{id}/  - Update.
        DELETE /api/orgs/{slug}/notifications/rules/{id}/  - Delete.
    """

    serializer_class = NotificationRuleSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_org(self) -> Organization:
        return _resolve_org_from_slug(self.request, self.kwargs["slug"])

    def get_queryset(self):
        org = self._get_org()
        return NotificationRule.objects.filter(organization=org).select_related("channel")

    def perform_create(self, serializer):
        org = self._get_org()
        membership = Membership.objects.filter(user=self.request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can manage notification rules.")
        self.request._org = org
        serializer.save(organization=org)

    def perform_update(self, serializer):
        org = self._get_org()
        membership = Membership.objects.filter(user=self.request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can manage notification rules.")
        self.request._org = org
        serializer.save()

    def perform_destroy(self, instance):
        org = self._get_org()
        membership = Membership.objects.filter(user=self.request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can manage notification rules.")
        instance.delete()


class NotificationLogViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Read-only list of notification logs for an organization.

    Endpoints:
        GET /api/orgs/{slug}/notifications/logs/  - List notification logs.
    """

    serializer_class = NotificationLogSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["created_at"]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        org = _resolve_org_from_slug(self.request, self.kwargs["slug"])
        return (
            NotificationLog.objects
            .filter(channel__organization=org)
            .select_related("rule", "channel", "alert")
        )


class ZoneAnalyticsView(viewsets.ViewSet):
    """Analytics endpoint for a specific zone.

    Endpoints:
        GET /api/zones/{id}/analytics/?days=7  - Zone analytics (7 or 30 days).
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> Response:
        """Return analytics for a zone."""
        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        days = request.query_params.get("days", "7")
        try:
            days = int(days)
        except ValueError:
            days = 7
        if days not in (7, 30):
            days = 7

        from .analytics import compute_zone_analytics

        data = compute_zone_analytics(zone, days=days)
        return Response(data)


class ZoneReportPDFView(viewsets.ViewSet):
    """PDF report download for a zone.

    Endpoints:
        GET /api/zones/{id}/report/pdf/?days=7  - Download PDF report.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> HttpResponse:
        """Generate and return a PDF report for a zone."""
        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        days = request.query_params.get("days", "7")
        try:
            days = int(days)
        except ValueError:
            days = 7
        if days not in (7, 30):
            days = 7

        from .analytics import compute_zone_analytics
        from .pdf_report import generate_zone_report_pdf

        data = compute_zone_analytics(zone, days=days)
        pdf_buffer = generate_zone_report_pdf(data)

        response = HttpResponse(pdf_buffer.read(), content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="zone_{zone.pk}_report_{days}d.pdf"'
        )
        return response


class OrgAnalyticsSummaryView(viewsets.ViewSet):
    """Organization-level analytics summary.

    Endpoints:
        GET /api/orgs/{slug}/analytics/summary/  - Org analytics overview.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request, slug: str = None) -> Response:
        """Return analytics summary for an organization."""
        org = _resolve_org_from_slug(request, slug)

        from .analytics import compute_org_analytics_summary

        data = compute_org_analytics_summary(org.pk)
        return Response(data)


class ScenarioViewSet(viewsets.ModelViewSet):
    """CRUD operations for Scenario resources, nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/scenarios/       - List scenarios.
        POST   /api/zones/{zone_id}/scenarios/       - Create a scenario.
        GET    /api/scenarios/{id}/                    - Retrieve a scenario.
        PATCH  /api/scenarios/{id}/                    - Update a scenario.
        DELETE /api/scenarios/{id}/                    - Delete a scenario.
        POST   /api/scenarios/{id}/run/                - Run a scenario now.
    """

    serializer_class = ScenarioSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_zone(self):
        """Return the parent Zone for nested routes, verifying membership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        """Return scenarios filtered by parent zone or by membership chain."""
        zone = self._get_zone()
        if zone:
            return Scenario.objects.filter(zone=zone).select_related("zone").prefetch_related("steps")
        org_ids = _user_org_ids(self.request.user)
        return (
            Scenario.objects
            .filter(zone__greenhouse__organization_id__in=org_ids)
            .select_related("zone")
            .prefetch_related("steps")
        )

    def perform_create(self, serializer: ScenarioSerializer) -> None:
        """Inject the parent zone before saving."""
        zone = self._get_zone()
        if not zone:
            raise serializers.ValidationError({"zone": "Zone ID is required."})
        serializer.save(zone=zone)

    @action(detail=True, methods=["post"], url_path="run")
    def run_now(self, request: Request, pk: int = None, **kwargs) -> Response:
        """Trigger immediate execution of a scenario.

        Returns 409 if the scenario is already running or if there is an
        actuator conflict with another running scenario in the same zone.
        """
        scenario = self.get_object()

        if scenario.status == Scenario.Status.RUNNING:
            return Response(
                {"detail": "Scenario is already running."},
                status=status.HTTP_409_CONFLICT,
            )

        # Check for actuator conflicts
        actuator_ids = set(scenario.steps.values_list("actuator_id", flat=True))
        conflicting = (
            Scenario.objects
            .filter(
                zone=scenario.zone,
                status=Scenario.Status.RUNNING,
                steps__actuator_id__in=actuator_ids,
            )
            .exclude(pk=scenario.pk)
            .distinct()
        )
        if conflicting.exists():
            names = ", ".join(conflicting.values_list("name", flat=True))
            return Response(
                {"detail": f"Actuator conflict with running scenario(s): {names}"},
                status=status.HTTP_409_CONFLICT,
            )

        from .tasks import execute_scenario_task

        execute_scenario_task.delay(scenario.pk, request.user.pk)
        return Response(
            {"detail": "Scenario execution started.", "scenario_id": scenario.pk},
            status=status.HTTP_202_ACCEPTED,
        )


class ScheduleViewSet(viewsets.ModelViewSet):
    """CRUD operations for Schedule resources, nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/schedules/       - List schedules.
        POST   /api/zones/{zone_id}/schedules/       - Create a schedule.
        GET    /api/schedules/{id}/                    - Retrieve.
        PATCH  /api/schedules/{id}/                    - Update.
        DELETE /api/schedules/{id}/                    - Delete.
    """

    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _get_zone(self):
        """Return the parent Zone for nested routes, verifying membership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        """Return schedules filtered by parent zone or by membership chain."""
        zone = self._get_zone()
        if zone:
            return (
                Schedule.objects
                .filter(scenario__zone=zone)
                .select_related("scenario")
            )
        org_ids = _user_org_ids(self.request.user)
        return (
            Schedule.objects
            .filter(scenario__zone__greenhouse__organization_id__in=org_ids)
            .select_related("scenario")
        )

    def perform_create(self, serializer: ScheduleSerializer) -> None:
        """Verify the scenario belongs to a zone in the user's orgs."""
        scenario = serializer.validated_data.get("scenario")
        if scenario:
            org_ids = _user_org_ids(self.request.user)
            if scenario.zone.greenhouse.organization_id not in org_ids:
                raise serializers.ValidationError(
                    {"scenario": "Scenario does not belong to your organization."}
                )
        serializer.save()
