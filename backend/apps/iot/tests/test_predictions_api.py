"""Tests for Sprint 20 AI & Predictions API endpoints.

Covers:
    - GET  /api/zones/{id}/predictions/
    - GET  /api/zones/{id}/anomalies/
    - GET  /api/zones/{id}/suggestions/
    - POST /api/zones/{id}/suggestions/apply/
    - GET  /api/zones/{id}/ai-report/
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.api.models import Membership, Organization
from apps.iot.models import (
    AnomalyRecord,
    Greenhouse,
    Sensor,
    SensorPrediction,
    SensorReading,
    SmartSuggestion,
    Zone,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org(db):
    """Create an Organization for the primary user."""
    return Organization.objects.create(name="AI Test Org", slug="ai-test-org")


@pytest.fixture
def ai_user(db, org):
    """Create a user with OWNER membership in the test organization."""
    user = User.objects.create_user(username="aiuser", password="testpass123!")
    Membership.objects.create(user=user, organization=org, role=Membership.Role.OWNER)
    return user


@pytest.fixture
def ai_client(ai_user):
    """Return an APIClient authenticated as ai_user via JWT."""
    client = APIClient()
    token = RefreshToken.for_user(ai_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


@pytest.fixture
def greenhouse(ai_user, org):
    """Create a Greenhouse linked to the test organization."""
    return Greenhouse.objects.create(
        name="AI Greenhouse",
        owner=ai_user,
        organization=org,
        location="Lab",
    )


@pytest.fixture
def zone(greenhouse):
    """Create a Zone inside the test greenhouse."""
    return Zone.objects.create(
        greenhouse=greenhouse,
        name="AI Zone",
        relay_id=250,
        is_active=True,
    )


@pytest.fixture
def sensor(zone):
    """Create a temperature Sensor in the test zone with thresholds."""
    return Sensor.objects.create(
        zone=zone,
        sensor_type=Sensor.SensorType.TEMPERATURE,
        label="Air Temp",
        unit="°C",
        min_threshold=15.0,
        max_threshold=35.0,
        is_active=True,
    )


@pytest.fixture
def sensor_reading(sensor):
    """Create a SensorReading for the test sensor."""
    return SensorReading.objects.create(sensor=sensor, value=22.5)


@pytest.fixture
def predictions(sensor):
    """Create SensorPrediction records in the near future."""
    now = timezone.now()
    return [
        SensorPrediction.objects.create(
            sensor=sensor,
            predicted_at=now + timedelta(hours=i + 1),
            predicted_value=22.0 + i * 0.5,
            confidence_lower=20.0 + i * 0.3,
            confidence_upper=24.0 + i * 0.7,
        )
        for i in range(3)
    ]


@pytest.fixture
def anomaly_records(sensor, sensor_reading):
    """Create AnomalyRecord instances for the test sensor."""
    return [
        AnomalyRecord.objects.create(
            sensor=sensor,
            reading=sensor_reading,
            detection_method=AnomalyRecord.DetectionMethod.ISOLATION_FOREST,
            anomaly_score=0.92,
            value=sensor_reading.value,
            explanation="Temperature spike detected",
        ),
        AnomalyRecord.objects.create(
            sensor=sensor,
            reading=sensor_reading,
            detection_method=AnomalyRecord.DetectionMethod.Z_SCORE,
            anomaly_score=3.5,
            value=sensor_reading.value,
            explanation="Value exceeds 3-sigma boundary",
        ),
    ]


@pytest.fixture
def suggestions(sensor):
    """Create SmartSuggestion instances (one pending, one already applied)."""
    pending = SmartSuggestion.objects.create(
        sensor=sensor,
        suggestion_type=SmartSuggestion.SuggestionType.THRESHOLD_ADJUST,
        message="Lower max threshold based on recent readings",
        suggested_min=16.0,
        suggested_max=32.0,
        confidence=0.87,
        is_applied=False,
    )
    applied = SmartSuggestion.objects.create(
        sensor=sensor,
        suggestion_type=SmartSuggestion.SuggestionType.TREND_WARNING,
        message="Raise min threshold — nighttime temps increasing",
        suggested_min=18.0,
        suggested_max=None,
        confidence=0.72,
        is_applied=True,
    )
    return {"pending": pending, "applied": applied}


# ---------------------------------------------------------------------------
# Second organization for cross-org isolation tests
# ---------------------------------------------------------------------------


@pytest.fixture
def other_org(db):
    """Create a second Organization."""
    return Organization.objects.create(name="Other Org", slug="other-org")


@pytest.fixture
def other_user(db, other_org):
    """Create a user belonging to a different organization."""
    user = User.objects.create_user(username="otheraiuser", password="testpass123!")
    Membership.objects.create(user=user, organization=other_org, role=Membership.Role.OWNER)
    return user


@pytest.fixture
def other_client(other_user):
    """Return an APIClient authenticated as other_user."""
    client = APIClient()
    token = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestZonePredictionsAPI:
    """Tests for GET /api/zones/{id}/predictions/."""

    def _url(self, zone_id: int) -> str:
        return f"/api/zones/{zone_id}/predictions/"

    def test_predictions_unauthenticated(self, zone):
        """Unauthenticated requests must be rejected with 401."""
        client = APIClient()
        response = client.get(self._url(zone.pk))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_predictions_success(self, ai_client, zone, sensor, predictions):
        """Authenticated owner gets prediction data grouped by sensor."""
        response = ai_client.get(self._url(zone.pk))
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert data["zone_id"] == zone.pk
        assert data["zone_name"] == zone.name
        assert "sensors" in data
        assert len(data["sensors"]) == 1

        sensor_entry = data["sensors"][0]
        assert sensor_entry["sensor_id"] == sensor.pk
        assert sensor_entry["sensor_type"] == Sensor.SensorType.TEMPERATURE
        assert len(sensor_entry["predictions"]) == 3

    def test_predictions_wrong_org(self, other_client, zone, sensor, predictions):
        """A user from a different organization must not access another org's zone."""
        response = other_client.get(self._url(zone.pk))
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestZoneAnomaliesAPI:
    """Tests for GET /api/zones/{id}/anomalies/."""

    def _url(self, zone_id: int) -> str:
        return f"/api/zones/{zone_id}/anomalies/"

    def test_anomalies_success(self, ai_client, zone, anomaly_records):
        """Returns anomaly records for the zone within default 7-day window."""
        response = ai_client.get(self._url(zone.pk))
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert data["zone_id"] == zone.pk
        assert data["period_days"] == 7
        assert len(data["anomalies"]) == 2

    def test_anomalies_with_days_param(self, ai_client, zone, sensor, sensor_reading):
        """The days query parameter narrows the time window."""
        # Create an anomaly dated 10 days ago (outside the 3-day window).
        old_anomaly = AnomalyRecord.objects.create(
            sensor=sensor,
            reading=sensor_reading,
            detection_method=AnomalyRecord.DetectionMethod.Z_SCORE,
            anomaly_score=3.1,
            value=40.0,
            explanation="Old anomaly",
        )
        # Manually backdate detected_at via queryset update.
        AnomalyRecord.objects.filter(pk=old_anomaly.pk).update(
            detected_at=timezone.now() - timedelta(days=10)
        )

        # Create a recent anomaly (should appear in both windows).
        AnomalyRecord.objects.create(
            sensor=sensor,
            reading=sensor_reading,
            detection_method=AnomalyRecord.DetectionMethod.ISOLATION_FOREST,
            anomaly_score=0.95,
            value=38.0,
            explanation="Recent anomaly",
        )

        # With days=3, the old anomaly should be excluded.
        response = ai_client.get(self._url(zone.pk), {"days": 3})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["period_days"] == 3
        assert len(response.data["anomalies"]) == 1

        # With days=30, both should appear.
        response = ai_client.get(self._url(zone.pk), {"days": 30})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["anomalies"]) == 2


@pytest.mark.django_db
class TestZoneSuggestionsAPI:
    """Tests for GET /api/zones/{id}/suggestions/ and POST /api/zones/{id}/suggestions/apply/."""

    def _list_url(self, zone_id: int) -> str:
        return f"/api/zones/{zone_id}/suggestions/"

    def _apply_url(self, zone_id: int) -> str:
        return f"/api/zones/{zone_id}/suggestions/apply/"

    def test_suggestions_success(self, ai_client, zone, suggestions):
        """Returns only pending (not yet applied) suggestions."""
        response = ai_client.get(self._list_url(zone.pk))
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert data["zone_id"] == zone.pk
        # Only the pending suggestion should be returned.
        assert len(data["suggestions"]) == 1
        assert data["suggestions"][0]["id"] == suggestions["pending"].pk
        assert data["suggestions"][0]["is_applied"] is False

    def test_apply_suggestion_success(self, ai_client, zone, sensor, suggestions):
        """Applying a suggestion updates the sensor thresholds and marks it applied."""
        pending = suggestions["pending"]
        response = ai_client.post(
            self._apply_url(zone.pk),
            {"suggestion_id": pending.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["sensor_id"] == sensor.pk
        assert response.data["min_threshold"] == pending.suggested_min
        assert response.data["max_threshold"] == pending.suggested_max

        # Verify the sensor thresholds were updated in the database.
        sensor.refresh_from_db()
        assert sensor.min_threshold == pending.suggested_min
        assert sensor.max_threshold == pending.suggested_max

        # Verify the suggestion is now marked as applied.
        pending.refresh_from_db()
        assert pending.is_applied is True

    def test_apply_suggestion_already_applied(self, ai_client, zone, suggestions):
        """Attempting to apply an already-applied suggestion returns 404."""
        applied = suggestions["applied"]
        response = ai_client.post(
            self._apply_url(zone.pk),
            {"suggestion_id": applied.pk},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestZoneAIReportAPI:
    """Tests for GET /api/zones/{id}/ai-report/."""

    def _url(self, zone_id: int) -> str:
        return f"/api/zones/{zone_id}/ai-report/"

    def test_ai_report_success(self, ai_client, zone, sensor, sensor_reading):
        """Returns a non-empty AI report string for a zone with data."""
        response = ai_client.get(self._url(zone.pk))
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert data["zone_id"] == zone.pk
        assert data["zone_name"] == zone.name
        assert "report" in data
        assert len(data["report"]) > 0
        # The report should reference the zone name.
        assert zone.name in data["report"]
        assert "generated_at" in data
