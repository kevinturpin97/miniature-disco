"""
ViewSets for IoT models in the Greenhouse SaaS API.

All ViewSets enforce ownership: a user can only access resources belonging
to greenhouses they own. Nested resources are filtered through the ownership chain.
"""

from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone as django_tz
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import (
    Actuator,
    Alert,
    AutomationRule,
    Command,
    Greenhouse,
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
    SensorReadingSerializer,
    SensorSerializer,
    ZoneSerializer,
)


class GreenhouseViewSet(viewsets.ModelViewSet):
    """CRUD operations for Greenhouse resources owned by the authenticated user.

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
        """Return only greenhouses owned by the requesting user."""
        return (
            Greenhouse.objects
            .filter(owner=self.request.user)
            .prefetch_related("zones")
        )


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
        """Return the parent Greenhouse for nested routes, verifying ownership."""
        greenhouse_id = self.kwargs.get("greenhouse_id")
        if greenhouse_id:
            return get_object_or_404(
                Greenhouse, pk=greenhouse_id, owner=self.request.user
            )
        return None

    def get_queryset(self):
        """Return zones filtered by parent greenhouse or by ownership chain."""
        greenhouse = self._get_greenhouse()
        if greenhouse:
            return Zone.objects.filter(greenhouse=greenhouse).select_related("greenhouse")
        return (
            Zone.objects
            .filter(greenhouse__owner=self.request.user)
            .select_related("greenhouse")
        )

    def perform_create(self, serializer: ZoneSerializer) -> None:
        """Inject the parent greenhouse and verify ownership before saving."""
        greenhouse = self._get_greenhouse()
        if not greenhouse:
            raise serializers.ValidationError({"greenhouse": "Greenhouse ID is required."})
        serializer.save(greenhouse=greenhouse)


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
        """Return the parent Zone for nested routes, verifying ownership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__owner=self.request.user
            )
        return None

    def get_queryset(self):
        """Return sensors filtered by parent zone or by ownership chain."""
        zone = self._get_zone()
        if zone:
            return Sensor.objects.filter(zone=zone).select_related("zone")
        return (
            Sensor.objects
            .filter(zone__greenhouse__owner=self.request.user)
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
        """List sensor readings with optional time range filters.

        Query params:
            from (ISO 8601 datetime): Filter readings after this timestamp.
            to   (ISO 8601 datetime): Filter readings before this timestamp.
        """
        sensor = self.get_object()
        qs = SensorReading.objects.filter(sensor=sensor).order_by("-received_at")

        from_dt = request.query_params.get("from")
        to_dt = request.query_params.get("to")

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
        """Return the parent Zone for nested routes, verifying ownership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__owner=self.request.user
            )
        return None

    def get_queryset(self):
        """Return actuators filtered by parent zone or by ownership chain."""
        zone = self._get_zone()
        if zone:
            return Actuator.objects.filter(zone=zone).select_related("zone")
        return (
            Actuator.objects
            .filter(zone__greenhouse__owner=self.request.user)
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
        """Return commands filtered by actuator, zone, or ownership chain."""
        actuator_id = self.kwargs.get("actuator_id")
        zone_id = self.kwargs.get("zone_id")

        if actuator_id:
            actuator = get_object_or_404(
                Actuator, pk=actuator_id, zone__greenhouse__owner=self.request.user
            )
            return Command.objects.filter(actuator=actuator).select_related("actuator")

        if zone_id:
            zone = get_object_or_404(
                Zone, pk=zone_id, greenhouse__owner=self.request.user
            )
            return Command.objects.filter(actuator__zone=zone).select_related("actuator")

        return (
            Command.objects
            .filter(actuator__zone__greenhouse__owner=self.request.user)
            .select_related("actuator")
        )

    def perform_create(self, serializer: CommandSerializer) -> None:
        """Inject the target actuator and verify ownership before saving."""
        actuator_id = self.kwargs.get("actuator_id")
        if not actuator_id:
            raise serializers.ValidationError({"actuator": "Actuator ID is required."})
        actuator = get_object_or_404(
            Actuator, pk=actuator_id, zone__greenhouse__owner=self.request.user
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
        """Return the parent Zone for nested routes, verifying ownership."""
        zone_id = self.kwargs.get("zone_id")
        if zone_id:
            return get_object_or_404(
                Zone, pk=zone_id, greenhouse__owner=self.request.user
            )
        return None

    def get_queryset(self):
        """Return automation rules filtered by parent zone or by ownership chain."""
        zone = self._get_zone()
        if zone:
            return (
                AutomationRule.objects
                .filter(zone=zone)
                .select_related("zone", "action_actuator")
            )
        return (
            AutomationRule.objects
            .filter(zone__greenhouse__owner=self.request.user)
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
        """Return alerts for greenhouses owned by the requesting user."""
        return (
            Alert.objects
            .filter(zone__greenhouse__owner=self.request.user)
            .select_related("zone", "sensor")
        )

    @action(detail=True, methods=["patch"], url_path="acknowledge")
    def acknowledge(self, request: Request, pk: int = None) -> Response:
        """Acknowledge an alert.

        Returns:
            Updated alert data. Returns 400 if already acknowledged.
        """
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
