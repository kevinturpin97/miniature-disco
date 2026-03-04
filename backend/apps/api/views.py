"""
Authentication and organization views for the Greenhouse SaaS API.
"""

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import Invitation, Membership, Organization
from .serializers import (
    ChangePasswordSerializer,
    InvitationCreateSerializer,
    InvitationSerializer,
    MembershipSerializer,
    OrganizationSerializer,
    RegisterSerializer,
    UserSerializer,
)

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
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can change member roles.")
        new_role = serializer.validated_data.get("role", membership.role)
        if new_role == Membership.Role.OWNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Cannot assign OWNER role via update.")
        if membership.role == Membership.Role.OWNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Cannot change the owner's role.")
        serializer.save()

    def perform_destroy(self, instance):
        """Only ADMIN+ can remove members. Cannot remove OWNER."""
        requesting = Membership.objects.filter(
            user=self.request.user, organization=instance.organization
        ).first()
        if not requesting or requesting.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can remove members.")
        if instance.role == Membership.Role.OWNER:
            from rest_framework.exceptions import PermissionDenied
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
            return Response(
                {"detail": "Only admins can send invitations."},
                status=status.HTTP_403_FORBIDDEN,
            )
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
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)
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
