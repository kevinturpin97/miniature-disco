"""Tests for Sprint 31 — Crop Intelligence & Plant Health Engine.

Covers:
- Pure engine functions (GDD, heat stress, irrigation, yield, disease risk)
- CropStatus model upsert via Celery task
- GET /api/zones/{id}/crop-status/ endpoint
- PATCH /api/zones/{id}/crop-indicator-preferences/ endpoint
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.iot.crop_intelligence import (
    calc_evapotranspiration,
    calc_gdd,
    calc_heat_index,
    climate_stress_level,
    disease_risk_level,
    growth_status_from_gdd,
    harvest_eta_days,
    hydration_status_from_et_and_soil,
    irrigation_needed_liters,
    light_level_status,
    plant_health_score,
    yield_prediction_score,
)


# ---------------------------------------------------------------------------
# Helper fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        username="crop_user",
        email="crop@test.com",
        password="pass1234!",
    )


@pytest.fixture
def zone(db, user):
    from apps.iot.models import Greenhouse, Zone

    gh = Greenhouse.objects.create(name="Test GH", owner=user)
    return Zone.objects.create(
        greenhouse=gh,
        name="Zone A",
        relay_id=42,
    )


# ---------------------------------------------------------------------------
# 1. GDD / Growth Status
# ---------------------------------------------------------------------------


class TestGrowthCalculation:
    """test_growth_calculation: GDD → growth_status mapping."""

    def test_gdd_above_base_temperature(self):
        """Temperature above base produces positive GDD."""
        gdd = calc_gdd(t_max=25.0, t_min=15.0)
        assert gdd == pytest.approx(10.0, rel=1e-3)

    def test_gdd_below_base_temperature_clamped_to_zero(self):
        """When mean temperature ≤ base, GDD must be 0."""
        gdd = calc_gdd(t_max=8.0, t_min=4.0)
        assert gdd == 0.0

    def test_gdd_exactly_at_base(self):
        """Mean exactly at base → GDD = 0."""
        gdd = calc_gdd(t_max=12.0, t_min=8.0)  # mean = 10 = base
        assert gdd == 0.0

    def test_growth_status_slow(self):
        assert growth_status_from_gdd(1.5) == "SLOW"

    def test_growth_status_normal(self):
        assert growth_status_from_gdd(6.0) == "NORMAL"

    def test_growth_status_fast(self):
        assert growth_status_from_gdd(12.0) == "FAST"

    def test_gdd_custom_base(self):
        """Custom base temperature is respected."""
        gdd = calc_gdd(t_max=20.0, t_min=10.0, t_base=5.0)
        assert gdd == pytest.approx(10.0, rel=1e-3)


# ---------------------------------------------------------------------------
# 2. Heat Stress
# ---------------------------------------------------------------------------


class TestHeatStress:
    """test_heat_stress: temperature + humidity → stress level."""

    def test_no_stress_cold_temp(self):
        """Low temperature → heat index ≈ temperature → no stress."""
        hi = calc_heat_index(20.0, 60.0)
        assert hi == pytest.approx(20.0)

    def test_no_stress_low_humidity(self):
        """Low humidity at warm temp → no stress (NOAA formula not triggered)."""
        hi = calc_heat_index(30.0, 30.0)
        assert hi == pytest.approx(30.0)

    def test_light_stress(self):
        """Moderate conditions → LIGHT stress."""
        hi = calc_heat_index(28.0, 65.0)
        from apps.iot.crop_intelligence import heat_stress_level
        assert heat_stress_level(hi) == "LIGHT"

    def test_high_stress(self):
        """Very hot + humid → HIGH stress."""
        hi = calc_heat_index(35.0, 80.0)
        from apps.iot.crop_intelligence import heat_stress_level
        level = heat_stress_level(hi)
        assert level in {"HIGH", "CRITICAL"}

    def test_critical_stress(self):
        """Extreme heat → CRITICAL stress."""
        hi = calc_heat_index(42.0, 90.0)
        from apps.iot.crop_intelligence import heat_stress_level
        assert heat_stress_level(hi) == "CRITICAL"

    def test_heat_index_increases_with_humidity(self):
        """Heat index should increase as humidity rises at constant temperature."""
        hi_low = calc_heat_index(32.0, 50.0)
        hi_high = calc_heat_index(32.0, 85.0)
        assert hi_high > hi_low


# ---------------------------------------------------------------------------
# 3. Irrigation Need
# ---------------------------------------------------------------------------


class TestIrrigationNeed:
    """test_irrigation_need: ET₀ + soil humidity → L/plant."""

    def test_irrigation_with_dry_soil(self):
        """Dry soil should require more irrigation than wet soil."""
        irr_dry = irrigation_needed_liters(et0=4.0, soil_humidity=20.0)
        irr_wet = irrigation_needed_liters(et0=4.0, soil_humidity=70.0)
        assert irr_dry > irr_wet

    def test_irrigation_no_sensor(self):
        """Without soil sensor, still returns a non-negative value."""
        irr = irrigation_needed_liters(et0=3.0, soil_humidity=None)
        assert irr >= 0.0

    def test_irrigation_zero_et0(self):
        """Zero ET₀ → zero irrigation needed."""
        irr = irrigation_needed_liters(et0=0.0, soil_humidity=30.0)
        assert irr == 0.0

    def test_evapotranspiration_positive(self):
        """ET₀ with positive temperature differential is > 0."""
        et0 = calc_evapotranspiration(t_mean=22.0, t_max=27.0, t_min=17.0)
        assert et0 > 0.0

    def test_hydration_dry(self):
        assert hydration_status_from_et_and_soil(5.0, 25.0) == "DRY"

    def test_hydration_optimal(self):
        assert hydration_status_from_et_and_soil(2.0, 60.0) == "OPTIMAL"

    def test_hydration_excess(self):
        assert hydration_status_from_et_and_soil(1.0, 80.0) == "EXCESS"


# ---------------------------------------------------------------------------
# 4. Yield Prediction
# ---------------------------------------------------------------------------


class TestYieldPrediction:
    """test_yield_prediction: multi-score → yield % deviation."""

    def test_all_optimal_positive(self):
        """Optimal conditions → positive yield deviation."""
        score = yield_prediction_score("FAST", "OPTIMAL", "OPTIMAL")
        assert score > 0.0

    def test_all_bad_negative(self):
        """Poor conditions → negative yield deviation."""
        score = yield_prediction_score("SLOW", "DRY", "INSUFFICIENT")
        assert score < 0.0

    def test_normal_conditions_near_zero(self):
        """Normal/Correct/Correct should be close to 0."""
        score = yield_prediction_score("NORMAL", "CORRECT", "CORRECT")
        assert score == pytest.approx(0.0)

    def test_plant_health_score_range(self):
        """Plant health score must be within [0, 100]."""
        score = plant_health_score(22.0, 60.0, 60.0, 30_000, 900)
        assert 0.0 <= score <= 100.0

    def test_plant_health_minimal_sensors(self):
        """Score should still compute with minimum sensor data."""
        score = plant_health_score(22.0, 60.0)
        assert 0.0 <= score <= 100.0


# ---------------------------------------------------------------------------
# 5. Disease Risk
# ---------------------------------------------------------------------------


class TestDiseaseRisk:
    """test_disease_risk: humidity + temperature → risk level."""

    def test_low_risk_dry_conditions(self):
        assert disease_risk_level(20.0, 50.0) == "LOW"

    def test_moderate_risk_warm_humid(self):
        assert disease_risk_level(20.0, 82.0) == "MODERATE"

    def test_high_risk_hot_very_humid(self):
        """Classic Downy Mildew conditions → HIGH risk."""
        assert disease_risk_level(20.0, 92.0) == "HIGH"

    def test_low_risk_outside_temperature_range(self):
        """Very high temperature → fungal risk low even with humidity."""
        assert disease_risk_level(35.0, 92.0) == "LOW"

    def test_climate_stress_none(self):
        assert climate_stress_level(22.0, 60.0) == "NONE"

    def test_climate_stress_critical(self):
        assert climate_stress_level(38.0, 10.0) == "CRITICAL"


# ---------------------------------------------------------------------------
# 6. Light & Harvest ETA
# ---------------------------------------------------------------------------


class TestLightAndHarvest:
    def test_light_insufficient(self):
        assert light_level_status(1000.0) == "INSUFFICIENT"

    def test_light_optimal(self):
        assert light_level_status(30_000.0) == "OPTIMAL"

    def test_light_unknown_no_sensor(self):
        assert light_level_status(None) == "UNKNOWN"

    def test_harvest_eta_no_data(self):
        assert harvest_eta_days(None, daily_gdd_estimate=None) is None

    def test_harvest_eta_calculation(self):
        """With 600 GDD accumulated and 10 GDD/day, ETA = 60 days."""
        eta = harvest_eta_days(gdd_accumulated=600.0, gdd_target=1200.0, daily_gdd_estimate=10.0)
        assert eta == 60


# ---------------------------------------------------------------------------
# 7. Celery task — calculate_crop_status
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCalculateCropStatusTask:
    """Tests for the Celery task that upserts CropStatus."""

    def test_task_creates_crop_status(self, zone):
        """Task should create a CropStatus row for the zone."""
        from apps.iot.tasks import calculate_crop_status
        from apps.iot.models import CropStatus

        result = calculate_crop_status(zone_id=zone.pk)
        assert result["zones_processed"] == 1
        assert result["errors"] == []
        assert CropStatus.objects.filter(zone=zone).exists()

    def test_task_upserts_on_second_call(self, zone):
        """Running twice should update, not duplicate."""
        from apps.iot.tasks import calculate_crop_status
        from apps.iot.models import CropStatus

        calculate_crop_status(zone_id=zone.pk)
        calculate_crop_status(zone_id=zone.pk)
        assert CropStatus.objects.filter(zone=zone).count() == 1

    def test_task_uses_sensor_readings(self, zone, db):
        """Task should use latest sensor readings when available."""
        from apps.iot.models import CropStatus, Sensor, SensorReading
        from apps.iot.tasks import calculate_crop_status

        sensor = Sensor.objects.create(
            zone=zone,
            sensor_type=Sensor.SensorType.TEMPERATURE,
            unit="°C",
        )
        SensorReading.objects.create(sensor=sensor, value=35.0)

        calculate_crop_status(zone_id=zone.pk)
        cs = CropStatus.objects.get(zone=zone)
        # High temp (35°C) should yield some heat stress
        assert cs.heat_stress in {"LIGHT", "HIGH", "CRITICAL"}

    def test_task_all_zones(self, zone, db):
        """Calling without zone_id processes all active zones."""
        from apps.iot.tasks import calculate_crop_status
        from apps.iot.models import CropStatus

        result = calculate_crop_status()
        assert result["zones_processed"] >= 1
        assert CropStatus.objects.filter(zone=zone).exists()


# ---------------------------------------------------------------------------
# 8. API endpoint — GET /api/zones/{id}/crop-status/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCropStatusEndpoint:
    """test endpoint GET /api/zones/{id}/crop-status/."""

    def test_returns_404_when_not_computed(self, api_client, user, zone):
        api_client.force_authenticate(user=user)
        url = reverse("zone-crop-status", kwargs={"pk": zone.pk})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_returns_crop_status_after_task(self, api_client, user, zone):
        from apps.iot.tasks import calculate_crop_status

        calculate_crop_status(zone_id=zone.pk)
        api_client.force_authenticate(user=user)
        url = reverse("zone-crop-status", kwargs={"pk": zone.pk})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "growth_status" in data
        assert "hydration_status" in data
        assert "heat_stress" in data
        assert "yield_prediction" in data
        assert "plant_health_score" in data
        assert "disease_risk" in data
        assert "harvest_eta_days" in data
        assert "irrigation_needed_liters" in data

    def test_requires_authentication(self, api_client, zone):
        url = reverse("zone-crop-status", kwargs={"pk": zone.pk})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# 9. API endpoint — PATCH /api/zones/{id}/crop-indicator-preferences/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCropIndicatorPreferenceEndpoint:
    def test_list_returns_all_indicators_enabled_by_default(self, api_client, user, zone):
        api_client.force_authenticate(user=user)
        url = reverse("zone-crop-indicator-preferences", kwargs={"pk": zone.pk})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # All indicators should be listed
        assert len(data) >= 10
        for item in data:
            assert "indicator" in item
            assert item["enabled"] is True  # default

    def test_patch_disables_indicator(self, api_client, user, zone):
        api_client.force_authenticate(user=user)
        url = reverse("zone-crop-indicator-preferences", kwargs={"pk": zone.pk})
        payload = {"preferences": [{"indicator": "GROWTH", "enabled": False}]}
        response = api_client.patch(url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        prefs = {p["indicator"]: p["enabled"] for p in data["preferences"]}
        assert prefs["GROWTH"] is False

    def test_patch_duplicate_indicator_returns_400(self, api_client, user, zone):
        api_client.force_authenticate(user=user)
        url = reverse("zone-crop-indicator-preferences", kwargs={"pk": zone.pk})
        payload = {
            "preferences": [
                {"indicator": "GROWTH", "enabled": True},
                {"indicator": "GROWTH", "enabled": False},
            ]
        }
        response = api_client.patch(url, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
