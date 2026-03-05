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
from rest_framework.exceptions import NotFound, ValidationError as DRFValidationError
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
    Template,
    TemplateCategory,
    TemplateRating,
    Zone,
)
from .serializers import (
    ActuatorSerializer,
    AlertSerializer,
    AnomalyRecordSerializer,
    ApplySuggestionSerializer,
    AutomationRuleSerializer,
    CommandSerializer,
    GreenhouseSerializer,
    NotificationChannelSerializer,
    NotificationLogSerializer,
    NotificationRuleSerializer,
    ScenarioSerializer,
    ScheduleSerializer,
    SensorPredictionSerializer,
    SensorReadingSerializer,
    SensorSerializer,
    SmartSuggestionSerializer,
    TemplateCategorySerializer,
    TemplateImportSerializer,
    TemplatePublishSerializer,
    TemplateRatingSerializer,
    TemplateSerializer,
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
        limit = org.effective_max_greenhouses
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
            limit = org.effective_max_zones
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


class PushSubscriptionView(viewsets.ViewSet):
    """Manage Web Push subscriptions for the authenticated user.

    POST   /api/push/subscribe/   — Register a new push subscription.
    DELETE /api/push/subscribe/   — Unsubscribe by endpoint URL.
    """

    permission_classes = [IsAuthenticated]

    def create(self, request: Request) -> Response:
        """Register a push subscription for the current user."""
        from .models import PushSubscription
        from .serializers import PushSubscriptionSerializer

        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        PushSubscription.objects.update_or_create(
            endpoint=serializer.validated_data["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": serializer.validated_data["p256dh"],
                "auth": serializer.validated_data["auth"],
            },
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request: Request) -> Response:
        """Remove a push subscription by endpoint URL."""
        from .models import PushSubscription

        endpoint = request.data.get("endpoint")
        if not endpoint:
            raise DRFValidationError({"detail": "endpoint is required."})
        deleted, _ = PushSubscription.objects.filter(
            user=request.user, endpoint=endpoint
        ).delete()
        if not deleted:
            raise NotFound("Push subscription not found.")
        return Response(status=status.HTTP_204_NO_CONTENT)


class VapidPublicKeyView(viewsets.ViewSet):
    """Return the VAPID public key for the frontend to subscribe to push.

    GET /api/push/vapid-key/
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request) -> Response:
        from django.conf import settings as django_settings

        public_key = django_settings.VAPID_PUBLIC_KEY
        if not public_key:
            return Response(
                {"detail": "VAPID keys not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"public_key": public_key})


def _snapshot_zone_config(zone: Zone) -> dict:
    """Create a JSON snapshot of a zone's configuration for template export.

    Args:
        zone: The zone to snapshot.

    Returns:
        A dict with keys: sensors, actuators, automation_rules, scenarios.
    """
    sensors = list(
        zone.sensors.values(
            "sensor_type", "label", "unit", "min_threshold", "max_threshold"
        )
    )
    actuators = list(
        zone.actuators.values("actuator_type", "name", "gpio_pin")
    )
    automation_rules = []
    for rule in zone.automation_rules.select_related("action_actuator"):
        automation_rules.append({
            "name": rule.name,
            "description": rule.description,
            "sensor_type": rule.sensor_type,
            "condition": rule.condition,
            "threshold_value": rule.threshold_value,
            "action_actuator_name": rule.action_actuator.name,
            "action_actuator_type": rule.action_actuator.actuator_type,
            "action_command_type": rule.action_command_type,
            "action_value": rule.action_value,
            "cooldown_seconds": rule.cooldown_seconds,
        })
    scenarios = []
    for scenario in zone.scenarios.prefetch_related("steps__actuator"):
        steps = []
        for step in scenario.steps.all():
            steps.append({
                "order": step.order,
                "action": step.action,
                "action_value": step.action_value,
                "delay_seconds": step.delay_seconds,
                "duration_seconds": step.duration_seconds,
                "actuator_name": step.actuator.name,
                "actuator_type": step.actuator.actuator_type,
            })
        scenarios.append({
            "name": scenario.name,
            "description": scenario.description,
            "steps": steps,
        })
    return {
        "sensors": sensors,
        "actuators": actuators,
        "automation_rules": automation_rules,
        "scenarios": scenarios,
    }


def _import_template_to_zone(zone: Zone, config: dict, mode: str, user=None) -> dict:
    """Import a template config into a zone.

    Args:
        zone: Target zone.
        config: Template config dict.
        mode: 'merge' or 'replace'.
        user: User performing the import (for command audit).

    Returns:
        Summary dict with counts of created resources.
    """
    from .models import Actuator, AutomationRule, Scenario, ScenarioStep, Sensor

    summary = {"sensors": 0, "actuators": 0, "automation_rules": 0, "scenarios": 0}

    if mode == "replace":
        zone.sensors.all().delete()
        zone.actuators.all().delete()
        zone.automation_rules.all().delete()
        zone.scenarios.all().delete()

    # Import sensors
    for s_data in config.get("sensors", []):
        sensor_type = s_data.get("sensor_type", "")
        if mode == "merge" and zone.sensors.filter(sensor_type=sensor_type).exists():
            continue
        Sensor.objects.create(
            zone=zone,
            sensor_type=sensor_type,
            label=s_data.get("label", ""),
            unit=s_data.get("unit", ""),
            min_threshold=s_data.get("min_threshold"),
            max_threshold=s_data.get("max_threshold"),
        )
        summary["sensors"] += 1

    # Import actuators — build a name→instance map for rule/scenario linking
    actuator_map: dict[str, Actuator] = {}
    for a_data in config.get("actuators", []):
        name = a_data.get("name", "")
        if mode == "merge" and zone.actuators.filter(name=name).exists():
            actuator_map[name] = zone.actuators.get(name=name)
            continue
        act = Actuator.objects.create(
            zone=zone,
            actuator_type=a_data.get("actuator_type", "VALVE"),
            name=name,
            gpio_pin=a_data.get("gpio_pin"),
        )
        actuator_map[name] = act
        summary["actuators"] += 1

    # Also index existing actuators for merge mode
    if mode == "merge":
        for act in zone.actuators.all():
            if act.name not in actuator_map:
                actuator_map[act.name] = act

    # Import automation rules
    for r_data in config.get("automation_rules", []):
        act_name = r_data.get("action_actuator_name", "")
        target_actuator = actuator_map.get(act_name)
        if not target_actuator:
            # Try matching by type if name match fails
            act_type = r_data.get("action_actuator_type", "")
            target_actuator = zone.actuators.filter(actuator_type=act_type).first()
        if not target_actuator:
            continue
        if mode == "merge" and zone.automation_rules.filter(name=r_data.get("name", "")).exists():
            continue
        AutomationRule.objects.create(
            zone=zone,
            name=r_data.get("name", ""),
            description=r_data.get("description", ""),
            sensor_type=r_data.get("sensor_type", "TEMP"),
            condition=r_data.get("condition", "GT"),
            threshold_value=r_data.get("threshold_value", 0),
            action_actuator=target_actuator,
            action_command_type=r_data.get("action_command_type", "ON"),
            action_value=r_data.get("action_value"),
            cooldown_seconds=r_data.get("cooldown_seconds", 300),
        )
        summary["automation_rules"] += 1

    # Import scenarios
    for sc_data in config.get("scenarios", []):
        sc_name = sc_data.get("name", "")
        if mode == "merge" and zone.scenarios.filter(name=sc_name).exists():
            continue
        scenario = Scenario.objects.create(
            zone=zone,
            name=sc_name,
            description=sc_data.get("description", ""),
        )
        for step_data in sc_data.get("steps", []):
            step_act_name = step_data.get("actuator_name", "")
            step_actuator = actuator_map.get(step_act_name)
            if not step_actuator:
                step_type = step_data.get("actuator_type", "")
                step_actuator = zone.actuators.filter(actuator_type=step_type).first()
            if not step_actuator:
                continue
            ScenarioStep.objects.create(
                scenario=scenario,
                actuator=step_actuator,
                order=step_data.get("order", 0),
                action=step_data.get("action", "ON"),
                action_value=step_data.get("action_value"),
                delay_seconds=step_data.get("delay_seconds", 0),
                duration_seconds=step_data.get("duration_seconds"),
            )
        summary["scenarios"] += 1

    return summary


class TemplateCategoryViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Read-only list of template categories.

    Endpoints:
        GET /api/templates/categories/  - List all template categories.
    """

    serializer_class = TemplateCategorySerializer
    permission_classes = [IsAuthenticated]
    queryset = TemplateCategory.objects.all()
    http_method_names = ["get", "head", "options"]


class TemplateViewSet(viewsets.ModelViewSet):
    """CRUD and marketplace actions for Template resources.

    Endpoints:
        GET    /api/templates/              - List published templates (marketplace).
        POST   /api/templates/              - Create a template directly.
        GET    /api/templates/{id}/          - Retrieve template detail.
        PATCH  /api/templates/{id}/          - Update a template.
        DELETE /api/templates/{id}/          - Delete a template.
        POST   /api/templates/{id}/clone/    - Clone template into a zone.
        POST   /api/templates/{id}/rate/     - Rate a template.
        GET    /api/templates/{id}/ratings/  - List ratings for a template.
    """

    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "is_official"]
    search_fields = ["name", "description"]
    ordering_fields = ["avg_rating", "clone_count", "created_at", "name"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        """Return published templates for list, or all user-owned for detail."""
        qs = Template.objects.select_related("organization", "category", "created_by")
        if self.action == "list":
            return qs.filter(is_published=True)
        return qs

    def perform_create(self, serializer: TemplateSerializer) -> None:
        """Set the organization and user on create."""
        org_ids = _user_org_ids(self.request.user)
        org = Organization.objects.filter(pk__in=org_ids).first()
        serializer.save(organization=org, created_by=self.request.user)

    def perform_update(self, serializer: TemplateSerializer) -> None:
        """Only template owners can update."""
        template = self.get_object()
        org_ids = _user_org_ids(self.request.user)
        if template.organization_id and template.organization_id not in org_ids:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only update templates from your organizations.")
        serializer.save()

    def perform_destroy(self, instance: Template) -> None:
        """Only template owners can delete."""
        org_ids = _user_org_ids(self.request.user)
        if instance.organization_id and instance.organization_id not in org_ids:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete templates from your organizations.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="clone")
    def clone(self, request: Request, pk: int = None) -> Response:
        """Clone a template's config into a target zone.

        Body:
            zone_id (int): Target zone ID.
            mode (str): 'merge' or 'replace' (default: 'merge').
        """
        template = self.get_object()
        zone_id = request.data.get("zone_id")
        if not zone_id:
            raise DRFValidationError({"zone_id": "Target zone_id is required."})

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(Zone, pk=zone_id, greenhouse__organization_id__in=org_ids)

        import_serializer = TemplateImportSerializer(data=request.data)
        import_serializer.is_valid(raise_exception=True)
        mode = import_serializer.validated_data["mode"]

        summary = _import_template_to_zone(zone, template.config, mode, user=request.user)

        # Increment clone count
        Template.objects.filter(pk=template.pk).update(clone_count=template.clone_count + 1)

        return Response(
            {
                "detail": f"Template '{template.name}' imported to zone '{zone.name}' ({mode} mode).",
                "summary": summary,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="rate")
    def rate(self, request: Request, pk: int = None) -> Response:
        """Rate a template (1–5 stars). Updates existing rating if present.

        Body:
            score (int): 1–5.
            comment (str, optional): Review text.
        """
        template = self.get_object()
        rating_serializer = TemplateRatingSerializer(data=request.data)
        rating_serializer.is_valid(raise_exception=True)

        score = rating_serializer.validated_data["score"]
        comment = rating_serializer.validated_data.get("comment", "")

        rating, created = TemplateRating.objects.update_or_create(
            template=template,
            user=request.user,
            defaults={"score": score, "comment": comment},
        )

        # Recompute average rating
        from django.db.models import Avg, Count

        stats = template.ratings.aggregate(avg=Avg("score"), cnt=Count("id"))
        Template.objects.filter(pk=template.pk).update(
            avg_rating=round(stats["avg"] or 0, 2),
            rating_count=stats["cnt"] or 0,
        )

        template.refresh_from_db()
        return Response(TemplateSerializer(template, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="ratings")
    def ratings(self, request: Request, pk: int = None) -> Response:
        """List all ratings for a template."""
        template = self.get_object()
        ratings = template.ratings.select_related("user").all()
        page = self.paginate_queryset(ratings)
        if page is not None:
            return self.get_paginated_response(
                TemplateRatingSerializer(page, many=True).data
            )
        return Response(TemplateRatingSerializer(ratings, many=True).data)


class ZonePublishTemplateView(viewsets.ViewSet):
    """Publish a zone's configuration as a marketplace template.

    Endpoints:
        POST /api/zones/{id}/publish-template/  - Snapshot the zone and create a template.
    """

    permission_classes = [IsAuthenticated]

    def create(self, request: Request, pk: int = None) -> Response:
        """Create a template from the current zone configuration."""
        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        publish_serializer = TemplatePublishSerializer(data=request.data)
        publish_serializer.is_valid(raise_exception=True)

        config = _snapshot_zone_config(zone)

        org = zone.greenhouse.organization
        template = Template.objects.create(
            organization=org,
            category=publish_serializer.validated_data.get("category"),
            name=publish_serializer.validated_data["name"],
            description=publish_serializer.validated_data.get("description", ""),
            version=publish_serializer.validated_data.get("version", "1.0.0"),
            changelog=publish_serializer.validated_data.get("changelog", ""),
            is_published=publish_serializer.validated_data.get("is_published", True),
            config=config,
            created_by=request.user,
        )

        return Response(
            TemplateSerializer(template, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Sprint 20 — AI & Predictions views
# ---------------------------------------------------------------------------


class ZonePredictionsView(viewsets.ViewSet):
    """Predictions for a zone's sensors (next 6 hours).

    Endpoints:
        GET /api/zones/{id}/predictions/  - Get predictions for all sensors in a zone.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> Response:
        """Return predictions grouped by sensor for the zone."""
        from .models import SensorPrediction

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        sensors = Sensor.objects.filter(zone=zone, is_active=True)
        sensor_predictions = {}

        for sensor in sensors:
            predictions = SensorPrediction.objects.filter(
                sensor=sensor,
                predicted_at__gte=django_tz.now(),
            ).order_by("predicted_at")

            sensor_predictions[sensor.pk] = {
                "sensor_id": sensor.pk,
                "sensor_type": sensor.sensor_type,
                "label": sensor.label or sensor.get_sensor_type_display(),
                "unit": sensor.unit,
                "predictions": SensorPredictionSerializer(predictions, many=True).data,
            }

        # Also include drift info
        from .ml_engine import detect_drift

        drift_data = {}
        for sensor in sensors:
            drift = detect_drift(sensor)
            if drift:
                drift_data[sensor.pk] = drift

        return Response({
            "zone_id": zone.pk,
            "zone_name": zone.name,
            "timestamp": django_tz.now().isoformat(),
            "sensors": list(sensor_predictions.values()),
            "drift": drift_data,
        })


class ZoneAnomaliesView(viewsets.ViewSet):
    """Anomalies detected for a zone.

    Endpoints:
        GET /api/zones/{id}/anomalies/  - Get recent anomalies for a zone.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> Response:
        """Return recent anomalies for a zone's sensors."""
        from datetime import timedelta

        from .models import AnomalyRecord

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        days = int(request.query_params.get("days", 7))
        since = django_tz.now() - timedelta(days=days)

        anomalies = (
            AnomalyRecord.objects.filter(
                sensor__zone=zone,
                detected_at__gte=since,
            )
            .select_related("sensor", "sensor__zone")
            .order_by("-detected_at")[:100]
        )

        return Response({
            "zone_id": zone.pk,
            "zone_name": zone.name,
            "period_days": days,
            "anomalies": AnomalyRecordSerializer(anomalies, many=True).data,
        })


class ZoneSuggestionsView(viewsets.ViewSet):
    """Smart threshold suggestions for a zone.

    Endpoints:
        GET  /api/zones/{id}/suggestions/         - Get suggestions for a zone.
        POST /api/zones/{id}/suggestions/apply/    - Apply a suggestion.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request, pk: int = None) -> Response:
        """Return pending suggestions for a zone's sensors."""
        from .models import SmartSuggestion

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        suggestions = (
            SmartSuggestion.objects.filter(
                sensor__zone=zone,
                is_applied=False,
            )
            .select_related("sensor")
            .order_by("-created_at")[:50]
        )

        return Response({
            "zone_id": zone.pk,
            "zone_name": zone.name,
            "suggestions": SmartSuggestionSerializer(suggestions, many=True).data,
        })

    def apply(self, request: Request, pk: int = None) -> Response:
        """Apply a smart suggestion to its sensor thresholds."""
        from .models import SmartSuggestion

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        ser = ApplySuggestionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        suggestion = get_object_or_404(
            SmartSuggestion,
            pk=ser.validated_data["suggestion_id"],
            sensor__zone=zone,
            is_applied=False,
        )

        sensor = suggestion.sensor
        if suggestion.suggested_min is not None:
            sensor.min_threshold = suggestion.suggested_min
        if suggestion.suggested_max is not None:
            sensor.max_threshold = suggestion.suggested_max
        sensor.save()

        suggestion.is_applied = True
        suggestion.save()

        return Response({
            "detail": f"Suggestion applied to {sensor.get_sensor_type_display()}.",
            "sensor_id": sensor.pk,
            "min_threshold": sensor.min_threshold,
            "max_threshold": sensor.max_threshold,
        })


class ZoneAIReportView(viewsets.ViewSet):
    """Weekly AI report for a zone.

    Endpoints:
        GET /api/zones/{id}/ai-report/  - Get the AI-generated weekly report.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> Response:
        """Generate and return an AI report for the zone."""
        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone, pk=pk, greenhouse__organization_id__in=org_ids
        )

        from .ml_engine import generate_weekly_ai_report

        report = generate_weekly_ai_report(zone.pk)

        return Response({
            "zone_id": zone.pk,
            "zone_name": zone.name,
            "report": report,
            "generated_at": django_tz.now().isoformat(),
        })
