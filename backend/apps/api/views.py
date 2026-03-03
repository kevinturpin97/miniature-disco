"""
Authentication views for the Greenhouse SaaS API.

Endpoints:
    POST  /api/auth/register/   - Create a new user account.
    POST  /api/auth/login/      - Obtain JWT access + refresh tokens.
    POST  /api/auth/refresh/    - Refresh the access token.
    POST  /api/auth/logout/     - Blacklist the refresh token.
    GET   /api/auth/me/         - Retrieve the authenticated user's profile.
    PATCH /api/auth/me/         - Partially update the authenticated user's profile.
"""

from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Create a new user account and return JWT tokens.

    Args:
        username: Unique username.
        email: User email address.
        password: Password.
        password2: Password confirmation.

    Returns:
        User details with access and refresh tokens (HTTP 201).
    """

    permission_classes = [AllowAny]
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
    """Obtain JWT access and refresh tokens.

    Args:
        username: Username.
        password: Password.

    Returns:
        access: JWT access token.
        refresh: JWT refresh token.
    """

    permission_classes = [AllowAny]


class RefreshView(TokenRefreshView):
    """Refresh the JWT access token using a valid refresh token.

    Args:
        refresh: Valid refresh token.

    Returns:
        access: New JWT access token.
        refresh: Rotated refresh token (ROTATE_REFRESH_TOKENS=True).
    """

    permission_classes = [AllowAny]


class LogoutView(APIView):
    """Blacklist the refresh token to invalidate the session.

    Args:
        refresh: The refresh token to blacklist.

    Returns:
        204 No Content on success, 400 on invalid or missing token.
    """

    permission_classes = [IsAuthenticated]

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
    """Retrieve or partially update the authenticated user's profile.

    Returns:
        User profile data.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "head", "options"]
    queryset = User.objects.all()

    def get_object(self) -> User:
        return self.request.user
