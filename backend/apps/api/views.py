"""
Authentication and organization views for the Greenhouse SaaS API.
"""

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import APIKey, APIKeyLog, Invitation, Membership, Organization, Webhook, WebhookDelivery
from .serializers import (
    APIKeyCreateResponseSerializer,
    APIKeyCreateSerializer,
    APIKeyLogSerializer,
    APIKeySerializer,
    ChangePasswordSerializer,
    InvitationCreateSerializer,
    InvitationSerializer,
    MembershipSerializer,
    OrganizationSerializer,
    RegisterSerializer,
    UserSerializer,
    WebhookDeliverySerializer,
    WebhookSerializer,
)
from .throttling import HasAPIKeyScope

User = get_user_model()


# ---------------------------------------------------------------------------
# Auth views
# ---------------------------------------------------------------------------

class RegisterView(generics.CreateAPIView):
    """Create a new user account, personal org, and return JWT tokens."""

    permission_classes = [AllowAny]
    throttle_classes = []  # Auth endpoints exempt from default throttling
    serializer_class = RegisterSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """Obtain JWT access and refresh tokens."""

    permission_classes = [AllowAny]
    throttle_classes = []  # Auth endpoints exempt from default throttling


class RefreshView(TokenRefreshView):
    """Refresh the JWT access token."""

    permission_classes = [AllowAny]
    throttle_classes = []  # Auth endpoints exempt from default throttling


class LogoutView(APIView):
    """Blacklist the refresh token to invalidate the session."""

    permission_classes = [AllowAny]
    throttle_classes = []  # Auth endpoints exempt from default throttling

    def post(self, request: Request) -> Response:
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            raise ValidationError({"detail": "Refresh token is required."})
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """Retrieve or partially update the authenticated user's profile."""

    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "head", "options"]
    queryset = User.objects.all()

    def get_object(self) -> User:
        return self.request.user


class ChangePasswordView(APIView):
    """Change the authenticated user's password."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        return Response({"detail": "Password changed successfully."})


# ---------------------------------------------------------------------------
# Organization views
# ---------------------------------------------------------------------------

class OrganizationListCreateView(generics.ListCreateAPIView):
    """List the user's organizations or create a new one.

    GET  /api/orgs/   — List organizations for the authenticated user.
    POST /api/orgs/   — Create a new organization (user becomes OWNER).
    """

    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Organization.objects.filter(
            memberships__user=self.request.user,
        ).distinct()


class OrganizationDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or update an organization by slug.

    GET   /api/orgs/{slug}/
    PATCH /api/orgs/{slug}/
    """

    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "slug"
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return Organization.objects.filter(memberships__user=self.request.user).distinct()


class MemberListView(generics.ListAPIView):
    """List members of an organization.

    GET /api/orgs/{slug}/members/
    """

    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org = get_object_or_404(
            Organization,
            slug=self.kwargs["slug"],
            memberships__user=self.request.user,
        )
        return Membership.objects.filter(organization=org).select_related("user")


class MemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Update role or remove a member from an organization.

    PATCH  /api/orgs/{slug}/members/{id}/   — Update role.
    DELETE /api/orgs/{slug}/members/{id}/   — Remove member.
    """

    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        org = get_object_or_404(
            Organization,
            slug=self.kwargs["slug"],
            memberships__user=self.request.user,
        )
        return Membership.objects.filter(organization=org).select_related("user")

    def perform_update(self, serializer):
        """Only ADMIN+ can change roles. Cannot change OWNER role."""
        membership = serializer.instance
        requesting = Membership.objects.filter(
            user=self.request.user, organization=membership.organization
        ).first()
        if not requesting or requesting.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            raise PermissionDenied("Only admins can change member roles.")
        new_role = serializer.validated_data.get("role", membership.role)
        if new_role == Membership.Role.OWNER:
            raise PermissionDenied("Cannot assign OWNER role via update.")
        if membership.role == Membership.Role.OWNER:
            raise PermissionDenied("Cannot change the owner's role.")
        serializer.save()

    def perform_destroy(self, instance):
        """Only ADMIN+ can remove members. Cannot remove OWNER."""
        requesting = Membership.objects.filter(
            user=self.request.user, organization=instance.organization
        ).first()
        if not requesting or requesting.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            raise PermissionDenied("Only admins can remove members.")
        if instance.role == Membership.Role.OWNER:
            raise PermissionDenied("Cannot remove the organization owner.")
        instance.delete()


class InviteView(APIView):
    """Send an invitation to join an organization.

    POST /api/orgs/{slug}/invite/
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, slug: str) -> Response:
        org = get_object_or_404(Organization, slug=slug)
        membership = Membership.objects.filter(user=request.user, organization=org).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            raise PermissionDenied("Only admins can send invitations.")
        serializer = InvitationCreateSerializer(
            data=request.data,
            context={"request": request, "organization": org},
        )
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)

    def get(self, request: Request, slug: str) -> Response:
        """List pending invitations for the organization."""
        org = get_object_or_404(Organization, slug=slug)
        membership = Membership.objects.filter(user=request.user, organization=org).first()
        if not membership:
            raise PermissionDenied("Not a member.")
        invitations = Invitation.objects.filter(organization=org).select_related("invited_by")
        return Response(InvitationSerializer(invitations, many=True).data)


class AcceptInvitationView(APIView):
    """Accept an invitation using the token.

    POST /api/invitations/{token}/accept/
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, token: str) -> Response:
        invitation = get_object_or_404(Invitation, token=token)

        if not invitation.is_valid:
            if invitation.accepted:
                return Response(
                    {"detail": "Invitation already accepted."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": "Invitation has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if invitation.email != request.user.email:
            return Response(
                {"detail": "This invitation was sent to a different email address."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if Membership.objects.filter(
            user=request.user, organization=invitation.organization
        ).exists():
            invitation.accepted = True
            invitation.save(update_fields=["accepted"])
            return Response(
                {"detail": "You are already a member of this organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        Membership.objects.create(
            user=request.user,
            organization=invitation.organization,
            role=invitation.role,
        )
        invitation.accepted = True
        invitation.save(update_fields=["accepted"])

        return Response(
            {"detail": f"You have joined {invitation.organization.name} as {invitation.role}."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Sprint 21 — API Publique & Developer Platform
# ---------------------------------------------------------------------------

class APIKeyViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Manage API keys for an organization.

    List, retrieve, create, revoke, and delete API keys scoped to the
    organization identified by the ``slug`` URL kwarg.

    Only users with ADMIN role or higher in the organization are allowed
    to manage API keys.

    Endpoints (nested under ``/api/orgs/<slug>/api-keys/``):
        GET    /                — List API keys for the organization.
        POST   /                — Create a new API key (returns the raw key once).
        GET    /{id}/           — Retrieve a single API key.
        POST   /{id}/revoke/    — Revoke (deactivate) an API key.
        DELETE /{id}/           — Permanently delete an API key.
    """

    permission_classes = [IsAuthenticated, HasAPIKeyScope]
    serializer_class = APIKeySerializer

    def get_organization(self) -> Organization:
        """Resolve the organization from the URL slug and verify ADMIN+ membership.

        Returns:
            The Organization instance.

        Raises:
            PermissionDenied: If the requesting user is not ADMIN+ in the org.
        """
        org = get_object_or_404(
            Organization,
            slug=self.kwargs["slug"],
            memberships__user=self.request.user,
        )
        membership = Membership.objects.filter(
            user=self.request.user, organization=org
        ).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            raise PermissionDenied("Only admins can manage API keys.")
        return org

    def get_queryset(self):
        """Return API keys belonging to the organization in the URL."""
        org = self.get_organization()
        return APIKey.objects.filter(organization=org)

    @action(detail=False, methods=["post"])
    def create_key(self, request: Request, **kwargs) -> Response:
        """Create a new API key for the organization.

        The raw key is returned only once in the response. It is stored
        hashed and cannot be retrieved again.

        Args:
            request: The incoming DRF request containing name, scope,
                and optional expires_at.

        Returns:
            Response with the key metadata and raw key string (HTTP 201).
        """
        org = self.get_organization()
        serializer = APIKeyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        api_key, raw_key = APIKey.create_key(
            organization=org,
            name=serializer.validated_data["name"],
            scope=serializer.validated_data.get("scope", APIKey.Scope.READ),
            created_by=request.user,
            expires_at=serializer.validated_data.get("expires_at"),
        )
        response_data = APIKeyCreateResponseSerializer(
            {"key": api_key, "raw_key": raw_key}
        ).data
        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def revoke(self, request: Request, **kwargs) -> Response:
        """Revoke (deactivate) an API key without deleting it.

        Args:
            request: The incoming DRF request.

        Returns:
            Response with a confirmation message (HTTP 200).
        """
        api_key = self.get_object()
        api_key.is_active = False
        api_key.save(update_fields=["is_active"])
        return Response({"detail": "API key revoked."}, status=status.HTTP_200_OK)


class APIKeyLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """List API key usage logs for an organization.

    Provides a read-only list of all API call logs for keys belonging
    to the organization identified by the ``slug`` URL kwarg.

    Endpoint (nested under ``/api/orgs/<slug>/api-key-logs/``):
        GET /  — List logs with optional filters by api_key, method, status_code.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = APIKeyLogSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["api_key", "method", "status_code"]

    def get_queryset(self):
        """Return logs for API keys belonging to the organization."""
        return APIKeyLog.objects.filter(
            api_key__organization__slug=self.kwargs["slug"],
        ).select_related("api_key")


class WebhookViewSet(viewsets.ModelViewSet):
    """CRUD operations for webhooks belonging to an organization.

    Allows ADMIN+ users to create, read, update, and delete webhooks
    scoped to the organization identified by the ``slug`` URL kwarg.

    Endpoints (nested under ``/api/orgs/<slug>/webhooks/``):
        GET    /       — List webhooks for the organization.
        POST   /       — Create a new webhook.
        GET    /{id}/  — Retrieve a single webhook.
        PATCH  /{id}/  — Update a webhook.
        DELETE /{id}/  — Delete a webhook.
    """

    permission_classes = [IsAuthenticated, HasAPIKeyScope]
    serializer_class = WebhookSerializer

    def get_organization(self) -> Organization:
        """Resolve the organization from the URL slug and verify ADMIN+ membership.

        Returns:
            The Organization instance.

        Raises:
            PermissionDenied: If the requesting user is not ADMIN+ in the org.
        """
        org = get_object_or_404(
            Organization,
            slug=self.kwargs["slug"],
            memberships__user=self.request.user,
        )
        membership = Membership.objects.filter(
            user=self.request.user, organization=org
        ).first()
        if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            raise PermissionDenied("Only admins can manage webhooks.")
        return org

    def get_queryset(self):
        """Return webhooks belonging to the organization in the URL."""
        org = self.get_organization()
        return Webhook.objects.filter(organization=org)

    def perform_create(self, serializer) -> None:
        """Set organization and created_by from the request context.

        Args:
            serializer: The validated webhook serializer.
        """
        org = self.get_organization()
        serializer.save(organization=org, created_by=self.request.user)


class WebhookDeliveryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """List webhook delivery attempts for an organization.

    Provides a read-only list of all delivery records for webhooks
    belonging to the organization identified by the ``slug`` URL kwarg.

    Endpoint (nested under ``/api/orgs/<slug>/webhook-deliveries/``):
        GET /  — List deliveries with optional filters by webhook, event_type, status.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = WebhookDeliverySerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["webhook", "event_type", "status"]

    def get_queryset(self):
        """Return deliveries for webhooks belonging to the organization."""
        return WebhookDelivery.objects.filter(
            webhook__organization__slug=self.kwargs["slug"],
        ).select_related("webhook")


class SandboxInfoView(APIView):
    """Return information about the sandbox organization for developer testing.

    The sandbox is a special organization with slug ``"sandbox"`` that
    provides simulated data for API integration testing.

    GET /api/sandbox/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        """Return sandbox organization metadata.

        Args:
            request: The incoming DRF request.

        Returns:
            Response with sandbox info (name, slug, plan, counts) or
            HTTP 404 if the sandbox organization does not exist.
        """
        try:
            org = Organization.objects.get(slug="sandbox")
        except Organization.DoesNotExist:
            return Response(
                {"detail": "Sandbox organization not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({
            "name": org.name,
            "slug": org.slug,
            "plan": org.plan,
            "greenhouse_count": org.greenhouses.count(),
            "zone_count": sum(
                gh.zones.count() for gh in org.greenhouses.all()
            ),
            "api_keys_count": org.api_keys.count(),
        })
