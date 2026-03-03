"""Tests for JWT authentication endpoints."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


@pytest.mark.django_db
class TestRegister:
    """POST /api/auth/register/"""

    url = "/api/auth/register/"

    def test_register_success(self, api_client):
        payload = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "StrongPass123!",
            "password2": "StrongPass123!",
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 201
        assert "access" in response.data
        assert "refresh" in response.data
        assert User.objects.filter(username="newuser").exists()

    def test_register_password_mismatch(self, api_client):
        payload = {
            "username": "user2",
            "email": "user2@example.com",
            "password": "StrongPass123!",
            "password2": "DifferentPass456!",
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 400

    def test_register_weak_password(self, api_client):
        payload = {
            "username": "user3",
            "email": "user3@example.com",
            "password": "123",
            "password2": "123",
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 400

    def test_register_duplicate_username(self, api_client, user):
        payload = {
            "username": user.username,
            "email": "other@example.com",
            "password": "StrongPass123!",
            "password2": "StrongPass123!",
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 400


@pytest.mark.django_db
class TestLogin:
    """POST /api/auth/login/"""

    url = "/api/auth/login/"

    def test_login_success(self, api_client, user):
        response = api_client.post(self.url, {"username": user.username, "password": "testpass123!"})
        assert response.status_code == 200
        assert "access" in response.data
        assert "refresh" in response.data

    def test_login_invalid_credentials(self, api_client, user):
        response = api_client.post(self.url, {"username": user.username, "password": "wrongpass"})
        assert response.status_code == 401

    def test_login_unknown_user(self, api_client):
        response = api_client.post(self.url, {"username": "nobody", "password": "pass"})
        assert response.status_code == 401


@pytest.mark.django_db
class TestRefresh:
    """POST /api/auth/refresh/"""

    login_url = "/api/auth/login/"
    url = "/api/auth/refresh/"

    def test_refresh_success(self, api_client, user):
        login = api_client.post(self.login_url, {"username": user.username, "password": "testpass123!"})
        refresh_token = login.data["refresh"]
        response = api_client.post(self.url, {"refresh": refresh_token})
        assert response.status_code == 200
        assert "access" in response.data

    def test_refresh_invalid_token(self, api_client):
        response = api_client.post(self.url, {"refresh": "not-a-valid-token"})
        assert response.status_code == 401


@pytest.mark.django_db
class TestLogout:
    """POST /api/auth/logout/"""

    login_url = "/api/auth/login/"
    url = "/api/auth/logout/"

    def test_logout_success(self, api_client, user):
        login = api_client.post(self.login_url, {"username": user.username, "password": "testpass123!"})
        refresh_token = login.data["refresh"]
        access_token = login.data["access"]
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = api_client.post(self.url, {"refresh": refresh_token})
        assert response.status_code == 204

    def test_logout_unauthenticated(self, api_client):
        response = api_client.post(self.url, {"refresh": "some-token"})
        assert response.status_code == 401

    def test_logout_blacklists_token(self, api_client, user):
        login = api_client.post(self.login_url, {"username": user.username, "password": "testpass123!"})
        refresh_token = login.data["refresh"]
        access_token = login.data["access"]
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        # First logout succeeds
        api_client.post(self.url, {"refresh": refresh_token})
        # Second logout with the same token should fail
        response = api_client.post(self.url, {"refresh": refresh_token})
        assert response.status_code in (400, 401)


@pytest.mark.django_db
class TestMe:
    """GET + PATCH /api/auth/me/"""

    url = "/api/auth/me/"

    def test_get_me_authenticated(self, auth_client, user):
        response = auth_client.get(self.url)
        assert response.status_code == 200
        assert response.data["username"] == user.username
        assert response.data["email"] == user.email

    def test_get_me_unauthenticated(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == 401

    def test_patch_me(self, auth_client, user):
        response = auth_client.patch(self.url, {"first_name": "Alice"})
        assert response.status_code == 200
        assert response.data["first_name"] == "Alice"

    def test_patch_me_unauthenticated(self, api_client):
        response = api_client.patch(self.url, {"first_name": "Bob"})
        assert response.status_code == 401
