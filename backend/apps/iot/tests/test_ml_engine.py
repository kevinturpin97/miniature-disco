"""Comprehensive tests for the ML engine (apps.iot.ml_engine).

Tests cover: Isolation Forest and Linear Regression training, prediction
generation, anomaly detection, drift analysis, smart suggestions, and
weekly AI report generation.

Uses pytest-django conventions and factory_boy fixtures defined in the
root conftest.py.
"""

from __future__ import annotations

import random
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.api.models import Membership, Organization
from apps.iot.ml_engine import (
    detect_anomaly_ml,
    detect_drift,
    generate_predictions,
    generate_smart_suggestions,
    generate_weekly_ai_report,
    train_isolation_forest,
    train_linear_regression,
)
from apps.iot.models import (
    Alert,
    AnomalyRecord,
    Greenhouse,
    MLModel,
    Sensor,
    SensorPrediction,
    SensorReading,
    SensorReadingHourly,
    SmartSuggestion,
    Zone,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_readings(
    sensor: Sensor,
    count: int,
    *,
    base_value: float = 25.0,
    stddev: float = 1.0,
    slope: float = 0.0,
    start_hours_ago: int | None = None,
) -> list[SensorReading]:
    """Create *count* SensorReading rows with optional trend and noise.

    Args:
        sensor: Target sensor.
        count: Number of readings to create.
        base_value: Centre value for the normal distribution.
        stddev: Standard deviation of gaussian noise.
        slope: Per-reading linear slope (use >0 for rising data).
        start_hours_ago: If provided, readings are back-dated starting
            this many hours ago (evenly spaced).

    Returns:
        The list of created readings (DB-refreshed for received_at).
    """
    now = timezone.now()
    readings: list[SensorReading] = []
    random.seed(42)  # deterministic tests

    for i in range(count):
        value = base_value + slope * i + random.gauss(0, stddev)
        r = SensorReading.objects.create(sensor=sensor, value=round(value, 4))

        if start_hours_ago is not None:
            hours_back = start_hours_ago - (start_hours_ago * i / max(count - 1, 1))
            SensorReading.objects.filter(pk=r.pk).update(
                received_at=now - timedelta(hours=hours_back),
            )
            r.refresh_from_db()

        readings.append(r)

    return readings


def _create_hourly_readings(
    sensor: Sensor,
    count: int,
    *,
    base_value: float = 25.0,
    stddev: float = 0.5,
    start_hours_ago: int | None = None,
) -> list[SensorReadingHourly]:
    """Create *count* SensorReadingHourly rows for LR training."""
    now = timezone.now()
    rows: list[SensorReadingHourly] = []
    random.seed(42)

    for i in range(count):
        avg = base_value + random.gauss(0, stddev)
        hour_offset = start_hours_ago - i if start_hours_ago else count - i
        row = SensorReadingHourly.objects.create(
            sensor=sensor,
            hour=now - timedelta(hours=max(hour_offset, 0)),
            avg_value=round(avg, 2),
            min_value=round(avg - abs(random.gauss(0, 0.5)), 2),
            max_value=round(avg + abs(random.gauss(0, 0.5)), 2),
            stddev_value=round(abs(random.gauss(0, 0.3)), 4),
            count=random.randint(5, 15),
        )
        rows.append(row)

    return rows


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def ml_user(db):
    """Return a Django user with an Organization and OWNER membership."""
    user = User.objects.create_user(
        username="mluser",
        email="mluser@test.com",
        password="testpass123!",
    )
    org = Organization.objects.create(name="ML Org", slug="ml-org")
    Membership.objects.create(user=user, organization=org, role=Membership.Role.OWNER)
    return user


@pytest.fixture()
def ml_org(ml_user):
    """Return the Organization associated with ml_user."""
    return Organization.objects.get(slug="ml-org")


@pytest.fixture()
def ml_greenhouse(ml_user, ml_org):
    """Return a Greenhouse for the ML test suite."""
    return Greenhouse.objects.create(
        name="ML Greenhouse",
        organization=ml_org,
        owner=ml_user,
    )


@pytest.fixture()
def ml_zone(ml_greenhouse):
    """Return a Zone inside the ML test greenhouse."""
    return Zone.objects.create(
        greenhouse=ml_greenhouse,
        name="ML Zone",
        relay_id=250,
    )


@pytest.fixture()
def ml_sensor(ml_zone):
    """Return a temperature Sensor in the ML zone with thresholds."""
    return Sensor.objects.create(
        zone=ml_zone,
        sensor_type=Sensor.SensorType.TEMPERATURE,
        unit="°C",
        min_threshold=10.0,
        max_threshold=35.0,
    )


@pytest.fixture()
def ml_sensor_no_thresholds(ml_zone):
    """Return a humidity Sensor without thresholds."""
    return Sensor.objects.create(
        zone=ml_zone,
        sensor_type=Sensor.SensorType.HUMIDITY_AIR,
        unit="%",
    )


# ===================================================================
# 1. train_isolation_forest
# ===================================================================


@pytest.mark.django_db
class TestTrainIsolationForest:
    """Tests for train_isolation_forest()."""

    def test_train_isolation_forest_insufficient_data(self, ml_sensor):
        """Returns None when fewer than 50 readings exist."""
        _create_readings(ml_sensor, count=30, start_hours_ago=48)

        result = train_isolation_forest(ml_sensor)

        assert result is None
        assert MLModel.objects.filter(
            sensor=ml_sensor,
            model_type=MLModel.ModelType.ISOLATION_FOREST,
        ).count() == 0

    def test_train_isolation_forest_success(self, ml_sensor):
        """Trains model successfully with 100+ readings and creates MLModel."""
        _create_readings(ml_sensor, count=120, start_hours_ago=100)

        result = train_isolation_forest(ml_sensor)

        assert result is not None
        assert isinstance(result, MLModel)
        assert result.model_type == MLModel.ModelType.ISOLATION_FOREST
        assert result.sensor == ml_sensor
        assert result.training_samples == 120
        assert result.model_data is not None
        assert len(result.model_data) > 0

        # Verify DB record
        db_model = MLModel.objects.get(
            sensor=ml_sensor,
            model_type=MLModel.ModelType.ISOLATION_FOREST,
        )
        assert db_model.pk == result.pk


# ===================================================================
# 2. train_linear_regression
# ===================================================================


@pytest.mark.django_db
class TestTrainLinearRegression:
    """Tests for train_linear_regression()."""

    def test_train_linear_regression_insufficient_data(self, ml_sensor):
        """Returns None when fewer than 24 raw readings and fewer than 12 hourly."""
        _create_readings(ml_sensor, count=10, start_hours_ago=20)

        result = train_linear_regression(ml_sensor)

        assert result is None
        assert MLModel.objects.filter(
            sensor=ml_sensor,
            model_type=MLModel.ModelType.LINEAR_REGRESSION,
        ).count() == 0

    def test_train_linear_regression_success(self, ml_sensor):
        """Trains model with 100+ readings, creates MLModel with MAE."""
        _create_readings(ml_sensor, count=120, start_hours_ago=150)
        _create_hourly_readings(ml_sensor, count=100, start_hours_ago=150)

        result = train_linear_regression(ml_sensor)

        assert result is not None
        assert isinstance(result, MLModel)
        assert result.model_type == MLModel.ModelType.LINEAR_REGRESSION
        assert result.sensor == ml_sensor
        assert result.training_samples >= 24
        assert result.mean_absolute_error is not None
        assert result.mean_absolute_error >= 0.0
        assert result.model_data is not None
        assert len(result.model_data) > 0

    def test_train_linear_regression_fallback_to_raw(self, ml_sensor):
        """Falls back to raw readings when hourly data is insufficient."""
        _create_readings(ml_sensor, count=50, start_hours_ago=100)
        # No hourly data created — should fall back to raw readings

        result = train_linear_regression(ml_sensor)

        assert result is not None
        assert result.training_samples == 50


# ===================================================================
# 3. generate_predictions
# ===================================================================


@pytest.mark.django_db
class TestGeneratePredictions:
    """Tests for generate_predictions()."""

    def test_generate_predictions_no_model(self, ml_sensor):
        """Returns empty list when no LR model exists."""
        result = generate_predictions(ml_sensor)

        assert result == []
        assert SensorPrediction.objects.filter(sensor=ml_sensor).count() == 0

    def test_generate_predictions_success(self, ml_sensor):
        """Creates 6 SensorPrediction records for the next 6 hours."""
        # Create enough data and train the LR model first
        _create_readings(ml_sensor, count=100, start_hours_ago=150)
        _create_hourly_readings(ml_sensor, count=100, start_hours_ago=150)
        lr_model = train_linear_regression(ml_sensor)
        assert lr_model is not None

        predictions = generate_predictions(ml_sensor, hours_ahead=6)

        assert len(predictions) == 6
        assert SensorPrediction.objects.filter(sensor=ml_sensor).count() == 6

        now = timezone.now()
        for i, pred in enumerate(predictions, start=1):
            assert isinstance(pred, SensorPrediction)
            assert pred.sensor == ml_sensor
            assert pred.predicted_value is not None
            assert pred.confidence_lower <= pred.predicted_value
            assert pred.predicted_value <= pred.confidence_upper
            # Prediction should be in the future
            assert pred.predicted_at > now - timedelta(minutes=1)

    def test_generate_predictions_replaces_old(self, ml_sensor):
        """Running predictions again deletes old ones before creating new."""
        _create_readings(ml_sensor, count=100, start_hours_ago=150)
        _create_hourly_readings(ml_sensor, count=100, start_hours_ago=150)
        train_linear_regression(ml_sensor)

        generate_predictions(ml_sensor, hours_ahead=6)
        assert SensorPrediction.objects.filter(sensor=ml_sensor).count() == 6

        generate_predictions(ml_sensor, hours_ahead=6)
        # Should still be 6, not 12
        assert SensorPrediction.objects.filter(sensor=ml_sensor).count() == 6


# ===================================================================
# 4. detect_anomaly_ml
# ===================================================================


@pytest.mark.django_db
class TestDetectAnomalyML:
    """Tests for detect_anomaly_ml()."""

    def test_detect_anomaly_ml_no_model(self, ml_sensor):
        """Returns None when no Isolation Forest model exists."""
        reading = SensorReading.objects.create(sensor=ml_sensor, value=999.0)

        result = detect_anomaly_ml(reading)

        assert result is None

    def test_detect_anomaly_ml_normal(self, ml_sensor):
        """Returns None for a value within the normal distribution."""
        # Train with normal data around 25.0
        _create_readings(ml_sensor, count=200, base_value=25.0, stddev=1.0, start_hours_ago=100)
        if_model = train_isolation_forest(ml_sensor)
        assert if_model is not None

        # Create a reading well within the normal range
        normal_reading = SensorReading.objects.create(sensor=ml_sensor, value=25.0)

        result = detect_anomaly_ml(normal_reading)

        assert result is None
        assert AnomalyRecord.objects.filter(sensor=ml_sensor).count() == 0

    def test_detect_anomaly_ml_anomaly(self, ml_sensor):
        """Creates AnomalyRecord and Alert for an extreme value."""
        # Train with tight normal data around 25.0
        _create_readings(ml_sensor, count=200, base_value=25.0, stddev=0.5, start_hours_ago=100)
        if_model = train_isolation_forest(ml_sensor)
        assert if_model is not None

        alert_count_before = Alert.objects.filter(
            zone=ml_sensor.zone,
            alert_type=Alert.AlertType.SENSOR_ERROR,
        ).count()

        # An extreme outlier value
        extreme_reading = SensorReading.objects.create(sensor=ml_sensor, value=999.0)

        result = detect_anomaly_ml(extreme_reading)

        assert result is not None
        assert isinstance(result, AnomalyRecord)
        assert result.sensor == ml_sensor
        assert result.reading == extreme_reading
        assert result.detection_method == AnomalyRecord.DetectionMethod.ISOLATION_FOREST
        assert result.anomaly_score > 0
        assert result.value == 999.0
        assert "Isolation Forest" in result.explanation

        # Verify an alert was created
        alert_count_after = Alert.objects.filter(
            zone=ml_sensor.zone,
            alert_type=Alert.AlertType.SENSOR_ERROR,
        ).count()
        assert alert_count_after == alert_count_before + 1

        alert = Alert.objects.filter(
            zone=ml_sensor.zone,
            alert_type=Alert.AlertType.SENSOR_ERROR,
        ).latest("created_at")
        assert alert.severity == Alert.Severity.WARNING
        assert "ML anomaly" in alert.message
        assert "999.0" in alert.message


# ===================================================================
# 5. detect_drift
# ===================================================================


@pytest.mark.django_db
class TestDetectDrift:
    """Tests for detect_drift()."""

    def test_detect_drift_insufficient_data(self, ml_sensor):
        """Returns None when fewer than 10 readings exist in the lookback."""
        _create_readings(ml_sensor, count=5, start_hours_ago=20)

        result = detect_drift(ml_sensor, lookback_hours=24)

        assert result is None

    def test_detect_drift_stable(self, ml_sensor):
        """Returns stable trend for flat data."""
        _create_readings(
            ml_sensor,
            count=50,
            base_value=25.0,
            stddev=0.001,
            slope=0.0,
            start_hours_ago=20,
        )

        result = detect_drift(ml_sensor, lookback_hours=24)

        assert result is not None
        assert result["trend"] == "stable"
        assert result["drift_alert"] is False
        assert abs(result["slope_per_hour"]) <= 0.01

    def test_detect_drift_rising_with_alert(self, ml_sensor):
        """Returns rising trend and creates THRESHOLD_HIGH alert when predicted to exceed max_threshold."""
        # ml_sensor has max_threshold=35.0 and min_threshold=10.0
        # Create a strong rising trend starting at 30.0 that will project above 35.0 in 6h
        now = timezone.now()
        for i in range(50):
            # Strong upward slope: 30.0 + (i * 0.5) over ~20 hours
            value = 30.0 + (i * 0.5)
            r = SensorReading.objects.create(sensor=ml_sensor, value=round(value, 2))
            hours_back = 20.0 - (20.0 * i / 49.0)
            SensorReading.objects.filter(pk=r.pk).update(
                received_at=now - timedelta(hours=hours_back),
            )

        alert_count_before = Alert.objects.filter(
            zone=ml_sensor.zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
        ).count()

        result = detect_drift(ml_sensor, lookback_hours=24)

        assert result is not None
        assert result["trend"] == "rising"
        assert result["slope_per_hour"] > 0.01
        assert result["predicted_6h"] > ml_sensor.max_threshold
        assert result["drift_alert"] is True

        # Verify a THRESHOLD_HIGH alert was created
        alert_count_after = Alert.objects.filter(
            zone=ml_sensor.zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
        ).count()
        assert alert_count_after > alert_count_before

        alert = Alert.objects.filter(
            zone=ml_sensor.zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
        ).latest("created_at")
        assert alert.severity == Alert.Severity.INFO
        assert "Drift prediction" in alert.message
        assert "trending towards" in alert.message

    def test_detect_drift_falling(self, ml_sensor_no_thresholds):
        """Returns falling trend when data is decreasing."""
        now = timezone.now()
        for i in range(50):
            value = 60.0 - (i * 0.8)
            r = SensorReading.objects.create(
                sensor=ml_sensor_no_thresholds,
                value=round(value, 2),
            )
            hours_back = 20.0 - (20.0 * i / 49.0)
            SensorReading.objects.filter(pk=r.pk).update(
                received_at=now - timedelta(hours=hours_back),
            )

        result = detect_drift(ml_sensor_no_thresholds, lookback_hours=24)

        assert result is not None
        assert result["trend"] == "falling"
        assert result["slope_per_hour"] < -0.01
        # No thresholds defined, so no drift_alert
        assert result["drift_alert"] is False


# ===================================================================
# 6. generate_smart_suggestions
# ===================================================================


@pytest.mark.django_db
class TestGenerateSmartSuggestions:
    """Tests for generate_smart_suggestions()."""

    def test_generate_smart_suggestions_insufficient_data(self, ml_sensor):
        """Returns empty list when fewer than 50 readings in the lookback window."""
        _create_readings(ml_sensor, count=20, start_hours_ago=48)

        result = generate_smart_suggestions(ml_sensor)

        assert result == []
        assert SmartSuggestion.objects.filter(sensor=ml_sensor).count() == 0

    def test_generate_smart_suggestions_success(self, ml_sensor_no_thresholds):
        """Creates a suggestion with recommended thresholds for a sensor without thresholds."""
        _create_readings(
            ml_sensor_no_thresholds,
            count=100,
            base_value=55.0,
            stddev=3.0,
            start_hours_ago=120,
        )

        suggestions = generate_smart_suggestions(ml_sensor_no_thresholds)

        assert len(suggestions) >= 1

        # Find the THRESHOLD_ADJUST suggestion
        threshold_suggestions = [
            s
            for s in suggestions
            if s.suggestion_type == SmartSuggestion.SuggestionType.THRESHOLD_ADJUST
        ]
        assert len(threshold_suggestions) == 1

        suggestion = threshold_suggestions[0]
        assert suggestion.sensor == ml_sensor_no_thresholds
        assert suggestion.suggested_min is not None
        assert suggestion.suggested_max is not None
        assert suggestion.suggested_min < suggestion.suggested_max
        assert suggestion.confidence > 0
        assert "Recommended thresholds" in suggestion.message
        assert str(suggestion.suggested_min) in suggestion.message
        assert str(suggestion.suggested_max) in suggestion.message

    def test_generate_smart_suggestions_with_existing_thresholds(self, ml_sensor):
        """Creates suggestion when current thresholds differ significantly from recommended."""
        # ml_sensor has min_threshold=10.0, max_threshold=35.0
        # Generate data that centres around a narrower range
        _create_readings(
            ml_sensor,
            count=100,
            base_value=22.0,
            stddev=0.5,
            start_hours_ago=120,
        )

        suggestions = generate_smart_suggestions(ml_sensor)

        # Should suggest tighter thresholds since current ones are very loose
        threshold_suggestions = [
            s
            for s in suggestions
            if s.suggestion_type == SmartSuggestion.SuggestionType.THRESHOLD_ADJUST
        ]
        if threshold_suggestions:
            suggestion = threshold_suggestions[0]
            # Suggested range should be tighter around the actual distribution
            assert suggestion.suggested_min > ml_sensor.min_threshold
            assert suggestion.suggested_max < ml_sensor.max_threshold


# ===================================================================
# 7. generate_weekly_ai_report
# ===================================================================


@pytest.mark.django_db
class TestGenerateWeeklyAIReport:
    """Tests for generate_weekly_ai_report()."""

    def test_generate_weekly_ai_report(self, ml_sensor):
        """Returns a non-empty string report containing zone and sensor information."""
        # Create a week of readings
        _create_readings(
            ml_sensor,
            count=80,
            base_value=24.0,
            stddev=2.0,
            start_hours_ago=168,
        )

        report = generate_weekly_ai_report(ml_sensor.zone.pk)

        assert isinstance(report, str)
        assert len(report) > 0
        assert "Weekly AI Report" in report
        assert ml_sensor.zone.name in report
        assert "Temperature" in report
        assert "Readings:" in report
        assert "Range:" in report
        assert "Average:" in report
        assert "Trend:" in report
        assert "Report generated automatically" in report

    def test_generate_weekly_ai_report_nonexistent_zone(self):
        """Returns empty string for a non-existent zone."""
        report = generate_weekly_ai_report(999999)

        assert report == ""

    def test_generate_weekly_ai_report_no_data(self, ml_sensor):
        """Returns a report even when no readings exist (reports 'No data')."""
        report = generate_weekly_ai_report(ml_sensor.zone.pk)

        assert isinstance(report, str)
        assert len(report) > 0
        assert "Weekly AI Report" in report
        assert "No data recorded" in report

    def test_generate_weekly_ai_report_includes_alert_count(self, ml_sensor):
        """Report includes the alert count for the week."""
        _create_readings(
            ml_sensor, count=80, base_value=24.0, stddev=2.0, start_hours_ago=168
        )

        # Create some alerts for the zone
        for _ in range(3):
            Alert.objects.create(
                sensor=ml_sensor,
                zone=ml_sensor.zone,
                alert_type=Alert.AlertType.THRESHOLD_HIGH,
                severity=Alert.Severity.WARNING,
                value=40.0,
                message="Test alert for report",
            )

        report = generate_weekly_ai_report(ml_sensor.zone.pk)

        assert "Total alerts this week: 3" in report
