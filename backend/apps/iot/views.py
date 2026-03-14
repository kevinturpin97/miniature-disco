"""
ViewSets for IoT models in the Greenhouse SaaS API.

All ViewSets enforce organization membership: a user can only access resources
belonging to greenhouses owned by organizations they are a member of.
"""

import csv
from datetime import datetime, timedelta

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
    AuditEvent,
    AutomationRule,
    Command,
    DataArchiveLog,
    DeviceMetrics,
    DeviceOTAJob,
    EdgeDevice,
    FirmwareRelease,
    Greenhouse,
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    RetentionPolicy,
    Scenario,
    Schedule,
    Sensor,
    SensorReading,
    SyncBatch,
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
    DataArchiveLogSerializer,
    DeviceMetricsSerializer,
    DeviceOTAJobSerializer,
    FirmwareReleaseSerializer,
    FleetDeviceSerializer,
    FleetOverviewSerializer,
    GreenhouseSerializer,
    NotificationChannelSerializer,
    NotificationLogSerializer,
    NotificationRuleSerializer,
    RetentionPolicySerializer,
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
    WeatherDataSerializer,
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
        """List sensor readings with optional time range, aggregation, and downsampling.

        Query params:
            from (ISO 8601 datetime): Filter readings after this timestamp.
            to   (ISO 8601 datetime): Filter readings before this timestamp.
            interval (str): Aggregate readings — ``hour`` or ``day``.
                Returns ``{"period", "avg_value"}`` instead of raw readings.
            max_points (int): Apply LTTB downsampling to reduce the result
                to at most this many points. Useful for large date ranges.
        """
        sensor = self.get_object()
        qs = SensorReading.objects.filter(sensor=sensor).order_by("-received_at")

        from_dt = request.query_params.get("from")
        to_dt = request.query_params.get("to")
        interval = request.query_params.get("interval")
        max_points_raw = request.query_params.get("max_points")

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

        # Parse max_points for LTTB downsampling
        max_points = None
        if max_points_raw is not None:
            try:
                max_points = int(max_points_raw)
                if max_points < 3:
                    raise ValueError
            except (ValueError, TypeError):
                raise serializers.ValidationError(
                    {"max_points": "Must be an integer >= 3."}
                )

        # Aggregation mode
        if interval in ("hour", "day"):
            trunc_fn = TruncHour if interval == "hour" else TruncDay
            aggregated = list(
                qs.annotate(period=trunc_fn("received_at"))
                .values("period")
                .annotate(avg_value=Avg("value"))
                .order_by("period")
            )
            # Apply LTTB downsampling if requested
            if max_points and len(aggregated) > max_points:
                from .data_pipeline import lttb_downsample

                lttb_data = [
                    {"timestamp": row["period"].timestamp(), "value": row["avg_value"], "_row": row}
                    for row in aggregated
                ]
                downsampled = lttb_downsample(lttb_data, max_points)
                aggregated = [d["_row"] for d in downsampled]

            # Reverse to -period for pagination consistency
            aggregated.reverse()
            page = self.paginate_queryset(aggregated)
            if page is not None:
                return self.get_paginated_response(page)
            return Response(aggregated)
        elif interval is not None:
            raise serializers.ValidationError(
                {"interval": "Must be 'hour' or 'day'."}
            )

        # Raw readings — apply LTTB if max_points requested
        if max_points:
            raw_list = list(qs.order_by("received_at").values("id", "value", "received_at", "relay_timestamp", "sensor_id"))
            if len(raw_list) > max_points:
                from .data_pipeline import lttb_downsample

                lttb_data = [
                    {"timestamp": row["received_at"].timestamp(), "value": row["value"], "_row": row}
                    for row in raw_list
                ]
                downsampled = lttb_downsample(lttb_data, max_points)
                raw_list = [d["_row"] for d in downsampled]

            # Reverse for -received_at ordering
            raw_list.reverse()
            return Response({"count": len(raw_list), "next": None, "previous": None, "results": raw_list})

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


class RetentionPolicyView(viewsets.ViewSet):
    """Manage the data retention policy for an organization.

    Endpoints:
        GET    /api/orgs/{slug}/retention-policy/  - Retrieve current policy.
        PUT    /api/orgs/{slug}/retention-policy/   - Replace policy.
        PATCH  /api/orgs/{slug}/retention-policy/   - Partial update.
    """

    permission_classes = [IsAuthenticated]

    def _get_org(self, request: Request, slug: str) -> Organization:
        """Return the organization, ensuring the user is a member."""
        org_ids = _user_org_ids(request.user)
        return get_object_or_404(Organization, slug=slug, pk__in=org_ids)

    def retrieve(self, request: Request, slug: str = None) -> Response:
        """Return the retention policy for the organization."""
        org = self._get_org(request, slug)
        policy, _ = RetentionPolicy.objects.get_or_create(organization=org)
        serializer = RetentionPolicySerializer(policy)
        return Response(serializer.data)

    def update(self, request: Request, slug: str = None) -> Response:
        """Full update of the retention policy."""
        org = self._get_org(request, slug)
        policy, _ = RetentionPolicy.objects.get_or_create(organization=org)
        serializer = RetentionPolicySerializer(policy, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request: Request, slug: str = None) -> Response:
        """Partial update of the retention policy."""
        org = self._get_org(request, slug)
        policy, _ = RetentionPolicy.objects.get_or_create(organization=org)
        serializer = RetentionPolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DataPipelineView(viewsets.ViewSet):
    """Data pipeline status and management for an organization.

    Endpoints:
        GET /api/orgs/{slug}/data-pipeline/  - Pipeline status overview.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request, slug: str = None) -> Response:
        """Return data pipeline status including partitions and archive logs."""
        org_ids = _user_org_ids(request.user)
        org = get_object_or_404(Organization, slug=slug, pk__in=org_ids)

        from .data_pipeline import get_partition_info

        # Get retention policy
        policy = RetentionPolicy.objects.filter(organization=org).first()
        policy_data = RetentionPolicySerializer(policy).data if policy else None

        # Get recent archive logs
        archive_logs = DataArchiveLog.objects.filter(organization=org)[:10]
        archive_data = DataArchiveLogSerializer(archive_logs, many=True).data

        # Get partition info
        partitions = get_partition_info()

        return Response({
            "retention_policy": policy_data,
            "archive_logs": archive_data,
            "partitions": partitions,
        })


# ---------------------------------------------------------------------------
# Sprint 24 — Multi-Site & Cartography
# ---------------------------------------------------------------------------


class SiteViewSet(viewsets.ModelViewSet):
    """CRUD operations for Site resources within the user's organizations.

    Endpoints:
        GET    /api/sites/                  - List all sites.
        POST   /api/sites/                  - Create a site.
        GET    /api/sites/{id}/             - Retrieve a site.
        PATCH  /api/sites/{id}/             - Update a site.
        DELETE /api/sites/{id}/             - Delete a site.
        GET    /api/sites/{id}/weather/     - Current + forecast weather.
        GET    /api/sites/{id}/weather/history/  - Weather history.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "address"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        from .serializers import SiteSerializer
        return SiteSerializer

    def get_queryset(self):
        from .models import Site
        org_ids = _user_org_ids(self.request.user)
        return Site.objects.filter(organization_id__in=org_ids)

    def perform_create(self, serializer):
        org_ids = _user_org_ids(self.request.user)
        org_id = self.request.data.get("organization")
        if org_id and int(org_id) in org_ids:
            org = Organization.objects.get(pk=org_id)
        else:
            org = Organization.objects.filter(pk__in=org_ids).first()
        serializer.save(organization=org)

    @action(detail=True, methods=["get"], url_path="weather")
    def weather(self, request: Request, pk=None) -> Response:
        """Return current weather and forecast for a site."""
        from .models import Site, WeatherData
        from .serializers import WeatherDataSerializer

        site = self.get_object()

        # Get most recent current weather
        current = WeatherData.objects.filter(
            site=site, is_forecast=False,
        ).first()

        # Get forecast data
        forecast = WeatherData.objects.filter(
            site=site, is_forecast=True,
        ).order_by("timestamp")[:72]

        return Response({
            "site_id": site.id,
            "site_name": site.name,
            "current": WeatherDataSerializer(current).data if current else None,
            "forecast": WeatherDataSerializer(forecast, many=True).data,
        })

    @action(detail=True, methods=["get"], url_path="weather/history")
    def weather_history(self, request: Request, pk=None) -> Response:
        """Return historical weather data for a site."""
        from .models import WeatherData
        from .serializers import WeatherDataSerializer

        site = self.get_object()
        days = int(request.query_params.get("days", 7))
        days = min(days, 30)
        since = django_tz.now() - timedelta(days=days)

        history = WeatherData.objects.filter(
            site=site,
            is_forecast=False,
            timestamp__gte=since,
        ).order_by("timestamp")

        return Response({
            "site_id": site.id,
            "site_name": site.name,
            "period_days": days,
            "data": WeatherDataSerializer(history, many=True).data,
        })


class SiteDashboardView(viewsets.ViewSet):
    """Multi-site dashboard with global status.

    Endpoints:
        GET /api/sites/dashboard/  - Aggregated status for all sites.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request) -> Response:
        """Return dashboard summary for all sites in the user's organizations."""
        from .models import Alert, Site, WeatherAlert, WeatherData, Zone

        org_ids = _user_org_ids(request.user)
        sites = Site.objects.filter(
            organization_id__in=org_ids, is_active=True,
        ).prefetch_related("greenhouses__zones")

        results = []
        now = django_tz.now()

        for site in sites:
            greenhouses = site.greenhouses.all()
            zones = Zone.objects.filter(greenhouse__in=greenhouses)
            zone_ids = list(zones.values_list("id", flat=True))

            zones_online = 0
            for z in zones:
                if z.last_seen and (now - z.last_seen).total_seconds() < z.transmission_interval * 2:
                    zones_online += 1

            active_alerts = Alert.objects.filter(
                zone_id__in=zone_ids,
                is_acknowledged=False,
            ).count()

            weather_alerts_count = WeatherAlert.objects.filter(
                site=site,
                is_acknowledged=False,
            ).count()

            current_weather = WeatherData.objects.filter(
                site=site, is_forecast=False,
            ).first()

            results.append({
                "site_id": site.id,
                "site_name": site.name,
                "latitude": site.latitude,
                "longitude": site.longitude,
                "timezone": site.timezone,
                "greenhouse_count": greenhouses.count(),
                "zone_count": zones.count(),
                "zones_online": zones_online,
                "active_alerts": active_alerts,
                "weather_alerts": weather_alerts_count,
                "current_weather": WeatherDataSerializer(current_weather).data if current_weather else None,
            })

        return Response(results)


class WeatherAlertViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """List and acknowledge weather alerts.

    Endpoints:
        GET   /api/weather-alerts/                     - List weather alerts.
        PATCH /api/weather-alerts/{id}/acknowledge/     - Acknowledge an alert.
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        from .serializers import WeatherAlertSerializer
        return WeatherAlertSerializer

    def get_queryset(self):
        from .models import WeatherAlert
        org_ids = _user_org_ids(self.request.user)
        qs = WeatherAlert.objects.filter(
            site__organization_id__in=org_ids,
        ).select_related("site")

        # Filters
        site_id = self.request.query_params.get("site")
        if site_id:
            qs = qs.filter(site_id=site_id)

        acknowledged = self.request.query_params.get("acknowledged")
        if acknowledged is not None:
            qs = qs.filter(is_acknowledged=acknowledged.lower() == "true")

        return qs

    @action(detail=True, methods=["patch"])
    def acknowledge(self, request: Request, pk=None) -> Response:
        """Acknowledge a weather alert."""
        from .models import WeatherAlert
        from .serializers import WeatherAlertSerializer

        org_ids = _user_org_ids(request.user)
        alert = get_object_or_404(
            WeatherAlert, pk=pk, site__organization_id__in=org_ids,
        )
        alert.is_acknowledged = True
        alert.acknowledged_by = request.user
        alert.acknowledged_at = django_tz.now()
        alert.save(update_fields=["is_acknowledged", "acknowledged_by", "acknowledged_at"])
        return Response(WeatherAlertSerializer(alert).data)


class WeatherCorrelationView(viewsets.ViewSet):
    """Weather-sensor data correlation for a zone.

    Endpoints:
        GET /api/zones/{id}/weather-correlation/  - Correlated data.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk=None) -> Response:
        """Return weather data correlated with sensor readings for a zone.

        Aligns hourly weather data with hourly sensor readings for the zone,
        so that external conditions can be compared with internal measurements.
        """
        from .models import SensorReadingHourly, Site, WeatherData

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone.objects.select_related("greenhouse"),
            pk=pk,
            greenhouse__organization_id__in=org_ids,
        )

        days = int(request.query_params.get("days", 7))
        days = min(days, 30)
        since = django_tz.now() - timedelta(days=days)

        # Find the site for this zone's greenhouse
        site = zone.greenhouse.site
        if not site:
            return Response({
                "zone_id": zone.id,
                "zone_name": zone.name,
                "period_days": days,
                "message": "No site associated with this greenhouse.",
                "data": [],
            })

        # Get hourly weather data
        weather_hourly = WeatherData.objects.filter(
            site=site,
            is_forecast=False,
            timestamp__gte=since,
        ).order_by("timestamp")

        # Get sensor hourly readings
        sensors = zone.sensors.filter(is_active=True)
        sensor_map = {s.id: f"{s.get_sensor_type_display()} ({s.label or s.sensor_type})" for s in sensors}

        hourly_readings = SensorReadingHourly.objects.filter(
            sensor__in=sensors,
            hour__gte=since,
        ).order_by("hour")

        # Build a lookup of sensor readings by hour
        readings_by_hour: dict[str, dict[str, float]] = {}
        for reading in hourly_readings:
            hour_key = reading.hour.isoformat()
            if hour_key not in readings_by_hour:
                readings_by_hour[hour_key] = {}
            label = sensor_map.get(reading.sensor_id, str(reading.sensor_id))
            readings_by_hour[hour_key][label] = reading.avg_value

        # Correlate weather with sensor data
        data = []
        for w in weather_hourly:
            hour_key = w.timestamp.isoformat()
            data.append({
                "timestamp": w.timestamp,
                "external_temperature": w.temperature,
                "external_humidity": w.humidity,
                "precipitation": w.precipitation,
                "uv_index": w.uv_index,
                "sensor_readings": readings_by_hour.get(hour_key, {}),
            })

        return Response({
            "zone_id": zone.id,
            "zone_name": zone.name,
            "site_name": site.name,
            "period_days": days,
            "data": data,
        })


# ---------------------------------------------------------------------------
# Sprint 25 — Compliance & Agricultural Traceability
# ---------------------------------------------------------------------------


class CropCycleViewSet(viewsets.ModelViewSet):
    """CRUD operations for CropCycle resources, nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/crop-cycles/  - List crop cycles.
        POST   /api/zones/{zone_id}/crop-cycles/  - Create a crop cycle.
        GET    /api/crop-cycles/{id}/              - Retrieve.
        PATCH  /api/crop-cycles/{id}/              - Partial update.
        DELETE /api/crop-cycles/{id}/              - Delete.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["created_at", "sowing_date", "status"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        from .serializers import CropCycleSerializer
        return CropCycleSerializer

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
        from .models import CropCycle
        zone = self._get_zone()
        if zone:
            return CropCycle.objects.filter(zone=zone).select_related("zone")
        org_ids = _user_org_ids(self.request.user)
        return CropCycle.objects.filter(
            zone__greenhouse__organization_id__in=org_ids
        ).select_related("zone")

    def perform_create(self, serializer) -> None:
        zone = self._get_zone()
        if not zone:
            raise DRFValidationError({"zone": "Zone context required."})
        serializer.save(zone=zone, created_by=self.request.user)


class NoteViewSet(viewsets.ModelViewSet):
    """CRUD operations for Note resources, nested under a Zone.

    Endpoints:
        GET    /api/zones/{zone_id}/notes/  - List notes.
        POST   /api/zones/{zone_id}/notes/  - Create a note.
        GET    /api/notes/{id}/              - Retrieve.
        PATCH  /api/notes/{id}/              - Partial update.
        DELETE /api/notes/{id}/              - Delete.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["observed_at", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        from .serializers import NoteSerializer
        return NoteSerializer

    def _get_zone(self):
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            org_ids = _user_org_ids(self.request.user)
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
        return None

    def get_queryset(self):
        from .models import Note
        zone = self._get_zone()
        if zone:
            return Note.objects.filter(zone=zone).select_related("zone", "author")
        org_ids = _user_org_ids(self.request.user)
        return Note.objects.filter(
            zone__greenhouse__organization_id__in=org_ids
        ).select_related("zone", "author")

    def perform_create(self, serializer) -> None:
        zone = self._get_zone()
        if not zone:
            raise DRFValidationError({"zone": "Zone context required."})
        serializer.save(zone=zone, author=self.request.user)


class CultureLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Read-only culture journal for a zone.

    Endpoints:
        GET /api/zones/{zone_id}/culture-journal/  - List culture log entries.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["created_at"]
    filterset_fields = ["entry_type", "crop_cycle"]

    def get_serializer_class(self):
        from .serializers import CultureLogSerializer
        return CultureLogSerializer

    def get_queryset(self):
        from .models import CultureLog
        zone_id = self.kwargs.get("zone_id")
        org_ids = _user_org_ids(self.request.user)
        if zone_id:
            get_object_or_404(
                Zone, pk=zone_id, greenhouse__organization_id__in=org_ids
            )
            return CultureLog.objects.filter(zone_id=zone_id).select_related("user")
        return CultureLog.objects.filter(
            zone__greenhouse__organization_id__in=org_ids
        ).select_related("user")


class TraceabilityReportView(viewsets.ViewSet):
    """Generate and download traceability PDF reports for a zone.

    Endpoints:
        POST /api/zones/{id}/traceability/pdf/   - Generate and download PDF.
        GET  /api/zones/{id}/traceability/verify/ - Verify a report's SHA256 hash.
    """

    permission_classes = [IsAuthenticated]

    def create(self, request: Request, pk: int = None) -> HttpResponse:
        """Generate a traceability PDF report for the zone."""
        from django.db.models import Avg, Count, Max, Min, StdDev

        from .models import CropCycle, CultureLog, Note, SensorReading, TraceabilityReport
        from .serializers import TraceabilityReportRequestSerializer

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone.objects.select_related("greenhouse"),
            pk=pk,
            greenhouse__organization_id__in=org_ids,
        )

        ser = TraceabilityReportRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        period_start = ser.validated_data["period_start"]
        period_end = ser.validated_data["period_end"]
        crop_cycle_id = ser.validated_data.get("crop_cycle")

        # Get crop cycle if specified
        crop_cycle_data = None
        crop_cycle_obj = None
        if crop_cycle_id:
            crop_cycle_obj = CropCycle.objects.filter(pk=crop_cycle_id, zone=zone).first()
            if crop_cycle_obj:
                crop_cycle_data = {
                    "species": crop_cycle_obj.species,
                    "variety": crop_cycle_obj.variety,
                    "status": crop_cycle_obj.get_status_display(),
                    "sowing_date": crop_cycle_obj.sowing_date,
                    "transplant_date": crop_cycle_obj.transplant_date,
                    "harvest_start_date": crop_cycle_obj.harvest_start_date,
                    "harvest_end_date": crop_cycle_obj.harvest_end_date,
                    "expected_yield": crop_cycle_obj.expected_yield,
                    "actual_yield": crop_cycle_obj.actual_yield,
                }

        # Sensor statistics for the period
        sensors = zone.sensors.filter(is_active=True)
        sensor_stats = []
        for sensor in sensors:
            stats = SensorReading.objects.filter(
                sensor=sensor,
                received_at__date__gte=period_start,
                received_at__date__lte=period_end,
            ).aggregate(
                count=Count("id"),
                min=Min("value"),
                max=Max("value"),
                avg=Avg("value"),
                stddev=StdDev("value"),
            )
            if stats["count"]:
                sensor_stats.append({
                    "sensor_type": sensor.get_sensor_type_display(),
                    "unit": sensor.unit,
                    **stats,
                })

        # Culture logs
        logs_qs = CultureLog.objects.filter(
            zone=zone,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).select_related("user").order_by("created_at")
        from .serializers import CultureLogSerializer
        culture_logs = CultureLogSerializer(logs_qs, many=True).data

        # Notes
        notes_qs = Note.objects.filter(
            zone=zone,
            observed_at__date__gte=period_start,
            observed_at__date__lte=period_end,
        ).select_related("author").order_by("observed_at")
        from .serializers import NoteSerializer
        notes = NoteSerializer(notes_qs, many=True, context={"request": request}).data

        # Generate PDF
        from .traceability_report import generate_traceability_pdf

        pdf_bytes, sha256_hash, signed_at = generate_traceability_pdf(
            zone_name=zone.name,
            greenhouse_name=zone.greenhouse.name,
            period_start=period_start,
            period_end=period_end,
            crop_cycle=crop_cycle_data,
            sensor_stats=sensor_stats,
            culture_logs=culture_logs,
            notes=notes,
        )

        # Store the report record
        TraceabilityReport.objects.create(
            zone=zone,
            crop_cycle=crop_cycle_obj,
            period_start=period_start,
            period_end=period_end,
            pdf_file=pdf_bytes,
            sha256_hash=sha256_hash,
            signed_at=signed_at,
            generated_by=request.user,
        )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        filename = f"traceability_{zone.name}_{period_start}_{period_end}.pdf"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["X-SHA256-Hash"] = sha256_hash
        response["X-Signed-At"] = signed_at.isoformat()
        return response

    @action(detail=False, methods=["get"], url_path="verify")
    def verify(self, request: Request, pk: int = None) -> Response:
        """Verify a report's SHA256 hash."""
        from .models import TraceabilityReport

        report_hash = request.query_params.get("hash", "")
        if not report_hash:
            return Response(
                {"detail": "Missing 'hash' query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report = TraceabilityReport.objects.filter(sha256_hash=report_hash).first()
        if report:
            return Response({
                "valid": True,
                "report_id": report.pk,
                "zone": report.zone.name,
                "period_start": report.period_start.isoformat(),
                "period_end": report.period_end.isoformat(),
                "signed_at": report.signed_at.isoformat(),
            })
        return Response({"valid": False, "detail": "No report found with this hash."})


class GDPRExportView(viewsets.ViewSet):
    """GDPR Data Subject Access Request: export all personal data.

    Endpoints:
        GET /api/auth/gdpr/export/  - Download personal data as JSON.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request) -> Response:
        """Export all personal data for the authenticated user."""
        from .gdpr import export_user_data

        data = export_user_data(request.user)
        return Response(data)


class GDPRErasureView(viewsets.ViewSet):
    """GDPR Right to Erasure: anonymize user data.

    Endpoints:
        POST /api/auth/gdpr/erasure/  - Anonymize all personal data.
    """

    permission_classes = [IsAuthenticated]

    def create(self, request: Request) -> Response:
        """Anonymize the authenticated user's personal data."""
        from .gdpr import anonymize_user

        confirm = request.data.get("confirm", False)
        if not confirm:
            return Response(
                {"detail": "Set 'confirm': true to proceed with data erasure."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        counts = anonymize_user(request.user)
        return Response({
            "detail": "Your personal data has been anonymized.",
            "affected_records": counts,
        })


class GlobalGAPExportView(viewsets.ViewSet):
    """Export zone data in GlobalG.A.P.-compliant JSON format.

    Endpoints:
        GET /api/zones/{id}/globalgap/export/  - Export GlobalG.A.P. JSON.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> Response:
        """Export GlobalG.A.P.-compliant JSON for a zone."""
        from django.db.models import Avg, Count, Max, Min, StdDev

        from .models import CropCycle, CultureLog, Note, SensorReading
        from .serializers import CultureLogSerializer, NoteSerializer

        org_ids = _user_org_ids(request.user)
        zone = get_object_or_404(
            Zone.objects.select_related("greenhouse", "greenhouse__organization"),
            pk=pk,
            greenhouse__organization_id__in=org_ids,
        )

        period_start_str = request.query_params.get("from")
        period_end_str = request.query_params.get("to")
        if not period_start_str or not period_end_str:
            return Response(
                {"detail": "Query parameters 'from' and 'to' are required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from datetime import date as date_type
            period_start = date_type.fromisoformat(period_start_str)
            period_end = date_type.fromisoformat(period_end_str)
        except ValueError:
            return Response(
                {"detail": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        crop_cycle_id = request.query_params.get("crop_cycle")
        crop_cycle_data = None
        if crop_cycle_id:
            cc = CropCycle.objects.filter(pk=crop_cycle_id, zone=zone).first()
            if cc:
                crop_cycle_data = {
                    "species": cc.species,
                    "variety": cc.variety,
                    "status": cc.get_status_display(),
                    "sowing_date": cc.sowing_date,
                    "transplant_date": cc.transplant_date,
                    "harvest_start_date": cc.harvest_start_date,
                    "harvest_end_date": cc.harvest_end_date,
                    "expected_yield": cc.expected_yield,
                    "actual_yield": cc.actual_yield,
                }

        # Sensor stats
        sensors = zone.sensors.filter(is_active=True)
        sensor_stats = []
        for sensor in sensors:
            stats = SensorReading.objects.filter(
                sensor=sensor,
                received_at__date__gte=period_start,
                received_at__date__lte=period_end,
            ).aggregate(
                count=Count("id"),
                min=Min("value"),
                max=Max("value"),
                avg=Avg("value"),
                stddev=StdDev("value"),
            )
            if stats["count"]:
                sensor_stats.append({
                    "sensor_type": sensor.get_sensor_type_display(),
                    "unit": sensor.unit,
                    **stats,
                })

        # Culture logs
        logs_qs = CultureLog.objects.filter(
            zone=zone,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).select_related("user").order_by("created_at")
        culture_logs = CultureLogSerializer(logs_qs, many=True).data

        # Notes
        notes_qs = Note.objects.filter(
            zone=zone,
            observed_at__date__gte=period_start,
            observed_at__date__lte=period_end,
        ).select_related("author").order_by("observed_at")
        notes = NoteSerializer(notes_qs, many=True, context={"request": request}).data

        from .globalgap import export_globalgap

        org_name = zone.greenhouse.organization.name if zone.greenhouse.organization else ""
        result = export_globalgap(
            zone_name=zone.name,
            greenhouse_name=zone.greenhouse.name,
            organization_name=org_name,
            period_start=period_start,
            period_end=period_end,
            crop_cycle=crop_cycle_data,
            sensor_stats=sensor_stats,
            culture_logs=culture_logs,
            notes=notes,
        )

        return Response(result)


# ---------------------------------------------------------------------------
# Sprint 27 — Edge Sync Agent: API endpoints
# ---------------------------------------------------------------------------


def _user_org_ids_for_view(user) -> list[int]:
    """Return organization IDs the user is a member of."""
    return list(
        Membership.objects.filter(user=user).values_list("organization_id", flat=True)
    )


class SyncStatusView(viewsets.ViewSet):
    """Sync status for the edge device(s) belonging to the user's organization.

    Endpoint:
        GET /api/sync/status/  — returns sync backlog, last sync, error state.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request) -> Response:
        """Return sync status for all active edge devices in the user's orgs."""
        org_ids = _user_org_ids_for_view(request.user)
        devices = EdgeDevice.objects.filter(organization_id__in=org_ids, is_active=True)

        # Unsynced backlog counts
        unsynced_readings = SensorReading.objects.filter(
            sensor__zone__greenhouse__organization_id__in=org_ids,
            cloud_synced=False,
        ).count()
        unsynced_commands = Command.objects.filter(
            actuator__zone__greenhouse__organization_id__in=org_ids,
            cloud_synced=False,
        ).count()
        unsynced_alerts = Alert.objects.filter(
            zone__greenhouse__organization_id__in=org_ids,
            cloud_synced=False,
        ).count()
        unsynced_audit = AuditEvent.objects.filter(
            cloud_synced=False,
        ).count()

        total_backlog = unsynced_readings + unsynced_commands + unsynced_alerts + unsynced_audit

        devices_data = []
        for device in devices:
            last_batch = (
                SyncBatch.objects.filter(edge_device=device)
                .order_by("-started_at")
                .first()
            )
            pending_retries = SyncBatch.objects.filter(
                edge_device=device,
                status=SyncBatch.Status.RETRY,
            ).count()
            devices_data.append({
                "device_id": str(device.device_id),
                "name": device.name,
                "firmware_version": device.firmware_version,
                "last_sync_at": device.last_sync_at.isoformat() if device.last_sync_at else None,
                "pending_retries": pending_retries,
                "last_batch": {
                    "status": last_batch.status,
                    "records_count": last_batch.records_count,
                    "payload_size_kb": last_batch.payload_size_kb,
                    "started_at": last_batch.started_at.isoformat(),
                    "completed_at": last_batch.completed_at.isoformat() if last_batch.completed_at else None,
                    "error_message": last_batch.error_message,
                } if last_batch else None,
            })

        return Response({
            "total_backlog": total_backlog,
            "backlog_detail": {
                "readings": unsynced_readings,
                "commands": unsynced_commands,
                "alerts": unsynced_alerts,
                "audit_events": unsynced_audit,
            },
            "devices": devices_data,
        })


class EdgeDeviceViewSet(viewsets.ViewSet):
    """CRUD for EdgeDevice registrations within an organization.

    Endpoints:
        GET  /api/orgs/{slug}/edge-devices/
        POST /api/orgs/{slug}/edge-devices/
        GET  /api/edge-devices/{device_id}/
        DELETE /api/edge-devices/{device_id}/
        GET  /api/edge-devices/{device_id}/sync-history/
    """

    permission_classes = [IsAuthenticated]

    def _get_org_or_403(self, request: Request, slug: str) -> Organization:
        org = get_object_or_404(Organization, slug=slug)
        if not Membership.objects.filter(user=request.user, organization=org).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Not a member of this organization.")
        return org

    def list(self, request: Request, slug: str = None) -> Response:
        """List all edge devices for the organization."""
        org = self._get_org_or_403(request, slug)
        devices = EdgeDevice.objects.filter(organization=org)
        data = [
            {
                "id": d.id,
                "device_id": str(d.device_id),
                "name": d.name,
                "firmware_version": d.firmware_version,
                "is_active": d.is_active,
                "last_sync_at": d.last_sync_at.isoformat() if d.last_sync_at else None,
                "created_at": d.created_at.isoformat(),
            }
            for d in devices
        ]
        return Response(data)

    def create(self, request: Request, slug: str = None) -> Response:
        """Register a new edge device. Returns the secret key only on creation."""
        import secrets as secrets_mod

        org = self._get_org_or_403(request, slug)
        name = request.data.get("name", "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        secret = secrets_mod.token_hex(32)  # 64-char hex → 256 bits
        device = EdgeDevice.objects.create(
            organization=org,
            name=name,
            secret_key=secret,
            firmware_version=request.data.get("firmware_version", ""),
        )
        return Response(
            {
                "id": device.id,
                "device_id": str(device.device_id),
                "name": device.name,
                "secret_key": secret,  # Only returned once at creation
                "created_at": device.created_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )

    def retrieve(self, request: Request, device_id: str = None) -> Response:
        """Get edge device details (secret key excluded)."""
        org_ids = _user_org_ids_for_view(request.user)
        device = get_object_or_404(EdgeDevice, device_id=device_id, organization_id__in=org_ids)
        return Response({
            "id": device.id,
            "device_id": str(device.device_id),
            "name": device.name,
            "firmware_version": device.firmware_version,
            "is_active": device.is_active,
            "last_sync_at": device.last_sync_at.isoformat() if device.last_sync_at else None,
            "created_at": device.created_at.isoformat(),
        })

    def destroy(self, request: Request, device_id: str = None) -> Response:
        """Deactivate (soft-delete) an edge device."""
        org_ids = _user_org_ids_for_view(request.user)
        device = get_object_or_404(EdgeDevice, device_id=device_id, organization_id__in=org_ids)
        device.is_active = False
        device.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def sync_history(self, request: Request, device_id: str = None) -> Response:
        """Return recent sync batch history for a device."""
        org_ids = _user_org_ids_for_view(request.user)
        device = get_object_or_404(EdgeDevice, device_id=device_id, organization_id__in=org_ids)
        batches = SyncBatch.objects.filter(edge_device=device).order_by("-started_at")[:50]
        data = [
            {
                "id": b.id,
                "status": b.status,
                "records_count": b.records_count,
                "payload_size_kb": b.payload_size_kb,
                "retry_count": b.retry_count,
                "error_message": b.error_message,
                "started_at": b.started_at.isoformat(),
                "completed_at": b.completed_at.isoformat() if b.completed_at else None,
            }
            for b in batches
        ]
        return Response(data)


# ---------------------------------------------------------------------------
# Sprint 31 — Crop Intelligence views
# ---------------------------------------------------------------------------


def _check_zone_permission(request: "Request", zone: "Zone") -> None:
    """Raise PermissionDenied if user has no access to the zone's greenhouse.

    Args:
        request: Authenticated DRF request.
        zone: Zone instance to check ownership against.
    """
    from rest_framework.exceptions import PermissionDenied

    from apps.api.models import Membership

    greenhouse = zone.greenhouse
    if greenhouse.organization_id is not None:
        has_access = Membership.objects.filter(
            organization_id=greenhouse.organization_id,
            user=request.user,
        ).exists()
        if not has_access and greenhouse.owner_id != request.user.pk:
            raise PermissionDenied("You do not have access to this zone.")
    elif greenhouse.owner_id != request.user.pk:
        raise PermissionDenied("You do not have access to this zone.")


class ZoneCropStatusView(viewsets.ViewSet):
    """Retrieve computed Crop Intelligence indicators for a zone.

    Endpoints:
        GET  /api/zones/{pk}/crop-status/  — return latest CropStatus or 404.
    """

    permission_classes = [IsAuthenticated]

    def retrieve(self, request: Request, pk: int = None) -> Response:
        """Return the latest computed crop status for the zone.

        Returns:
            Serialised CropStatus or 404 if not yet computed.
        """
        from .models import CropStatus
        from .serializers import CropStatusSerializer

        zone = get_object_or_404(Zone, pk=pk)
        _check_zone_permission(request, zone)
        crop_status = CropStatus.objects.filter(zone=zone).first()
        if crop_status is None:
            return Response(
                {"detail": "Crop status not yet computed for this zone."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(CropStatusSerializer(crop_status).data)


class ZoneCropIndicatorPreferenceView(viewsets.ViewSet):
    """Manage per-user crop indicator display preferences.

    Endpoints:
        GET   /api/zones/{pk}/crop-indicator-preferences/  — list preferences.
        PATCH /api/zones/{pk}/crop-indicator-preferences/  — bulk upsert.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request, pk: int = None) -> Response:
        """Return all indicator preferences for the authenticated user.

        Missing preference rows are returned as ``enabled=True`` (default).
        """
        from .models import CropIndicatorPreference
        from .serializers import CropIndicatorPreferenceSerializer

        zone = get_object_or_404(Zone, pk=pk)
        _check_zone_permission(request, zone)
        prefs = CropIndicatorPreference.objects.filter(user=request.user)
        existing = {p.indicator: p.enabled for p in prefs}

        data = [
            {"indicator": ind, "enabled": existing.get(ind, True)}
            for ind, _ in CropIndicatorPreference.Indicator.choices
        ]
        return Response(data)

    def partial_update(self, request: Request, pk: int = None) -> Response:
        """Bulk-upsert indicator preferences.

        Accepts ``{"preferences": [{"indicator": "GROWTH", "enabled": false}, ...]}``.
        """
        from .models import CropIndicatorPreference
        from .serializers import CropIndicatorPreferenceBulkSerializer

        zone = get_object_or_404(Zone, pk=pk)
        _check_zone_permission(request, zone)
        ser = CropIndicatorPreferenceBulkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        updated: list[dict] = []
        for item in ser.validated_data["preferences"]:
            obj, _ = CropIndicatorPreference.objects.update_or_create(
                user=request.user,
                indicator=item["indicator"],
                defaults={"enabled": item["enabled"]},
            )
            updated.append({"indicator": obj.indicator, "enabled": obj.enabled})

        return Response({"preferences": updated})


# ---------------------------------------------------------------------------
# Sprint 33 — OTA Firmware & Fleet Management
# ---------------------------------------------------------------------------


class FirmwareReleaseViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """CRUD for firmware releases.

    Endpoints:
        GET    /api/fleet/firmware/       - List releases (filterable by channel).
        POST   /api/fleet/firmware/       - Publish a new release.
        GET    /api/fleet/firmware/{id}/  - Retrieve a release.
    """

    serializer_class = FirmwareReleaseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["channel", "is_active"]
    ordering_fields = ["created_at", "version"]

    def get_queryset(self):
        """Return all active firmware releases."""
        return FirmwareRelease.objects.all()


class FleetDeviceViewSet(viewsets.ViewSet):
    """Fleet management endpoints for edge devices.

    Endpoints:
        GET    /api/fleet/devices/              - List devices with metrics & OTA status.
        GET    /api/fleet/devices/{device_id}/  - Device detail with history.
        POST   /api/fleet/devices/{device_id}/update/   - Trigger an OTA job.
        POST   /api/fleet/devices/{device_id}/rollback/ - Rollback firmware.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request) -> Response:
        """List all edge devices across user's organizations with latest metrics."""
        org_ids = _user_org_ids(request.user)
        devices = (
            EdgeDevice.objects.filter(organization_id__in=org_ids, is_active=True)
            .select_related("organization")
            .prefetch_related("metrics", "ota_jobs")
        )
        serializer = FleetDeviceSerializer(devices, many=True)
        return Response(serializer.data)

    def retrieve(self, request: Request, device_id: str = None) -> Response:
        """Retrieve a single device with full details."""
        org_ids = _user_org_ids(request.user)
        device = get_object_or_404(
            EdgeDevice,
            device_id=device_id,
            organization_id__in=org_ids,
        )
        data = FleetDeviceSerializer(device).data
        # Include OTA history
        ota_jobs = device.ota_jobs.select_related("firmware_release").order_by("-created_at")[:20]
        data["ota_history"] = DeviceOTAJobSerializer(ota_jobs, many=True).data
        # Include 24h metrics
        cutoff = django_tz.now() - timedelta(hours=24)
        metrics_24h = device.metrics.filter(recorded_at__gte=cutoff).order_by("recorded_at")
        data["metrics_24h"] = DeviceMetricsSerializer(metrics_24h, many=True).data
        return Response(data)

    @action(detail=True, methods=["post"], url_path="update")
    def trigger_update(self, request: Request, device_id: str = None) -> Response:
        """Trigger an OTA firmware update on the device.

        Expects: ``{"firmware_release_id": <int>}``
        """
        org_ids = _user_org_ids(request.user)
        device = get_object_or_404(
            EdgeDevice,
            device_id=device_id,
            organization_id__in=org_ids,
        )
        firmware_id = request.data.get("firmware_release_id")
        if not firmware_id:
            return Response(
                {"detail": "firmware_release_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        firmware = get_object_or_404(FirmwareRelease, pk=firmware_id, is_active=True)

        # Check no active OTA job exists
        active_statuses = [
            DeviceOTAJob.Status.PENDING,
            DeviceOTAJob.Status.DOWNLOADING,
            DeviceOTAJob.Status.INSTALLING,
        ]
        if device.ota_jobs.filter(status__in=active_statuses).exists():
            return Response(
                {"detail": "Device already has an active OTA job."},
                status=status.HTTP_409_CONFLICT,
            )

        job = DeviceOTAJob.objects.create(
            edge_device=device,
            firmware_release=firmware,
            previous_version=device.firmware_version or "",
        )
        return Response(DeviceOTAJobSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="rollback")
    def rollback(self, request: Request, device_id: str = None) -> Response:
        """Rollback to the previous firmware version.

        Finds the last successful OTA job and creates a new job targeting
        the version prior to that update.
        """
        org_ids = _user_org_ids(request.user)
        device = get_object_or_404(
            EdgeDevice,
            device_id=device_id,
            organization_id__in=org_ids,
        )

        # Find last successful job with a previous_version
        last_success = (
            device.ota_jobs.filter(status=DeviceOTAJob.Status.SUCCESS)
            .exclude(previous_version="")
            .order_by("-completed_at")
            .first()
        )
        if not last_success:
            return Response(
                {"detail": "No previous version available for rollback."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Find the firmware release matching the previous version
        target_firmware = FirmwareRelease.objects.filter(
            version=last_success.previous_version, is_active=True
        ).first()
        if not target_firmware:
            return Response(
                {"detail": f"Firmware release {last_success.previous_version} not found or inactive."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check no active OTA job
        active_statuses = [
            DeviceOTAJob.Status.PENDING,
            DeviceOTAJob.Status.DOWNLOADING,
            DeviceOTAJob.Status.INSTALLING,
        ]
        if device.ota_jobs.filter(status__in=active_statuses).exists():
            return Response(
                {"detail": "Device already has an active OTA job."},
                status=status.HTTP_409_CONFLICT,
            )

        job = DeviceOTAJob.objects.create(
            edge_device=device,
            firmware_release=target_firmware,
            previous_version=device.firmware_version or "",
        )
        return Response(DeviceOTAJobSerializer(job).data, status=status.HTTP_201_CREATED)


class FleetOverviewView(viewsets.ViewSet):
    """Aggregated fleet statistics.

    Endpoints:
        GET /api/fleet/overview/ - Global fleet stats.
    """

    permission_classes = [IsAuthenticated]

    def list(self, request: Request) -> Response:
        """Return aggregated fleet statistics."""
        org_ids = _user_org_ids(request.user)
        devices = EdgeDevice.objects.filter(organization_id__in=org_ids, is_active=True)

        total = devices.count()
        one_hour_ago = django_tz.now() - timedelta(hours=1)

        online = devices.filter(last_sync_at__gte=one_hour_ago).count()
        offline = total - online

        # Outdated: devices not on the latest stable firmware
        latest_stable = (
            FirmwareRelease.objects.filter(channel=FirmwareRelease.Channel.STABLE, is_active=True)
            .order_by("-created_at")
            .first()
        )
        outdated = 0
        if latest_stable:
            outdated = devices.exclude(firmware_version=latest_stable.version).count()

        active_ota = DeviceOTAJob.objects.filter(
            edge_device__organization_id__in=org_ids,
            status__in=[
                DeviceOTAJob.Status.PENDING,
                DeviceOTAJob.Status.DOWNLOADING,
                DeviceOTAJob.Status.INSTALLING,
            ],
        ).count()

        orgs_count = devices.values("organization_id").distinct().count()

        data = {
            "total_devices": total,
            "online_devices": online,
            "offline_devices": offline,
            "outdated_devices": outdated,
            "active_ota_jobs": active_ota,
            "organizations_count": orgs_count,
        }
        return Response(FleetOverviewSerializer(data).data)
