"""Machine Learning engine for sensor predictions and anomaly detection.

Provides functions for:
- Linear regression drift prediction on 24h data
- Isolation Forest anomaly detection per sensor
- 6-hour prediction generation
- Smart threshold suggestions based on historical data
"""

from __future__ import annotations

import logging
import pickle
import statistics
from datetime import timedelta
from typing import Any

import numpy as np
from django.utils import timezone
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

from .models import (
    Alert,
    AnomalyRecord,
    MLModel,
    Sensor,
    SensorPrediction,
    SensorReading,
    SmartSuggestion,
)

logger = logging.getLogger(__name__)


def train_isolation_forest(sensor: Sensor, lookback_hours: int = 168) -> MLModel | None:
    """Train an Isolation Forest model for a sensor.

    Args:
        sensor: The sensor to train for.
        lookback_hours: Hours of historical data to use (default 7 days).

    Returns:
        The created/updated MLModel instance, or None if insufficient data.
    """
    since = timezone.now() - timedelta(hours=lookback_hours)
    values = list(
        SensorReading.objects.filter(
            sensor=sensor,
            received_at__gte=since,
        )
        .order_by("received_at")
        .values_list("value", flat=True)
    )

    if len(values) < 50:
        logger.debug(
            "Insufficient data for IF training: sensor=%s count=%d",
            sensor.pk,
            len(values),
        )
        return None

    X = np.array(values).reshape(-1, 1)
    model = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42,
    )
    model.fit(X)

    model_bytes = pickle.dumps(model)

    ml_model, _ = MLModel.objects.update_or_create(
        sensor=sensor,
        model_type=MLModel.ModelType.ISOLATION_FOREST,
        defaults={
            "model_data": model_bytes,
            "training_samples": len(values),
        },
    )

    logger.info(
        "Trained Isolation Forest: sensor=%s samples=%d",
        sensor.pk,
        len(values),
    )
    return ml_model


def train_linear_regression(sensor: Sensor, lookback_hours: int = 168) -> MLModel | None:
    """Train a Linear Regression model for drift prediction.

    Uses hourly averages over the lookback period for smoother predictions.

    Args:
        sensor: The sensor to train for.
        lookback_hours: Hours of historical data to use (default 7 days).

    Returns:
        The created/updated MLModel instance, or None if insufficient data.
    """
    from .models import SensorReadingHourly

    since = timezone.now() - timedelta(hours=lookback_hours)
    hourly = list(
        SensorReadingHourly.objects.filter(
            sensor=sensor,
            hour__gte=since,
        )
        .order_by("hour")
        .values_list("hour", "avg_value")
    )

    if len(hourly) < 12:
        # Fall back to raw readings if not enough hourly data
        raw = list(
            SensorReading.objects.filter(
                sensor=sensor,
                received_at__gte=since,
            )
            .order_by("received_at")
            .values_list("received_at", "value")
        )
        if len(raw) < 24:
            logger.debug(
                "Insufficient data for LR training: sensor=%s",
                sensor.pk,
            )
            return None
        hourly = raw

    base_time = hourly[0][0]
    X = np.array([
        (t - base_time).total_seconds() / 3600.0
        for t, _ in hourly
    ]).reshape(-1, 1)
    y = np.array([v for _, v in hourly])

    model = LinearRegression()
    model.fit(X, y)

    # Compute MAE on training data
    predictions = model.predict(X)
    mae = float(np.mean(np.abs(predictions - y)))

    model_bytes = pickle.dumps(model)

    ml_model, _ = MLModel.objects.update_or_create(
        sensor=sensor,
        model_type=MLModel.ModelType.LINEAR_REGRESSION,
        defaults={
            "model_data": model_bytes,
            "training_samples": len(hourly),
            "mean_absolute_error": round(mae, 4),
        },
    )

    logger.info(
        "Trained Linear Regression: sensor=%s samples=%d MAE=%.4f",
        sensor.pk,
        len(hourly),
        mae,
    )
    return ml_model


def generate_predictions(sensor: Sensor, hours_ahead: int = 6) -> list[SensorPrediction]:
    """Generate predictions for the next N hours using trained LR model.

    Args:
        sensor: The sensor to predict for.
        hours_ahead: Number of hours to predict ahead.

    Returns:
        List of created SensorPrediction instances.
    """
    try:
        ml_model = MLModel.objects.get(
            sensor=sensor,
            model_type=MLModel.ModelType.LINEAR_REGRESSION,
        )
    except MLModel.DoesNotExist:
        logger.debug("No LR model for sensor=%s — skipping predictions", sensor.pk)
        return []

    model: LinearRegression = pickle.loads(ml_model.model_data)
    mae = ml_model.mean_absolute_error or 0.0

    # Get the latest reading time as reference
    from .models import SensorReadingHourly

    latest_hourly = (
        SensorReadingHourly.objects.filter(sensor=sensor)
        .order_by("-hour")
        .first()
    )
    if latest_hourly:
        base_time = latest_hourly.hour
    else:
        latest_raw = (
            SensorReading.objects.filter(sensor=sensor)
            .order_by("-received_at")
            .first()
        )
        if not latest_raw:
            return []
        base_time = latest_raw.received_at

    # Get the training base time to compute correct offsets
    training_since = timezone.now() - timedelta(hours=168)
    first_hourly = (
        SensorReadingHourly.objects.filter(
            sensor=sensor,
            hour__gte=training_since,
        )
        .order_by("hour")
        .first()
    )
    if first_hourly:
        training_base = first_hourly.hour
    else:
        first_raw = (
            SensorReading.objects.filter(
                sensor=sensor,
                received_at__gte=training_since,
            )
            .order_by("received_at")
            .first()
        )
        if not first_raw:
            return []
        training_base = first_raw.received_at

    now = timezone.now()

    # Delete old predictions for this sensor
    SensorPrediction.objects.filter(sensor=sensor).delete()

    predictions = []
    for h in range(1, hours_ahead + 1):
        future_time = now + timedelta(hours=h)
        hours_from_base = (future_time - training_base).total_seconds() / 3600.0
        X = np.array([[hours_from_base]])
        predicted_value = float(model.predict(X)[0])

        # Confidence interval based on MAE (approximate 95% CI ~ 2*MAE)
        confidence_margin = mae * 2 if mae > 0 else abs(predicted_value) * 0.05

        prediction = SensorPrediction.objects.create(
            sensor=sensor,
            predicted_at=future_time,
            predicted_value=round(predicted_value, 2),
            confidence_lower=round(predicted_value - confidence_margin, 2),
            confidence_upper=round(predicted_value + confidence_margin, 2),
        )
        predictions.append(prediction)

    logger.info(
        "Generated %d predictions for sensor=%s",
        len(predictions),
        sensor.pk,
    )
    return predictions


def detect_anomaly_ml(reading: SensorReading) -> AnomalyRecord | None:
    """Detect anomaly using Isolation Forest model.

    Args:
        reading: The sensor reading to evaluate.

    Returns:
        AnomalyRecord if anomalous, None otherwise.
    """
    try:
        ml_model = MLModel.objects.get(
            sensor=reading.sensor,
            model_type=MLModel.ModelType.ISOLATION_FOREST,
        )
    except MLModel.DoesNotExist:
        return None

    model: IsolationForest = pickle.loads(ml_model.model_data)
    X = np.array([[reading.value]])

    # score_samples returns anomaly scores; more negative = more anomalous
    score = float(model.score_samples(X)[0])
    prediction = model.predict(X)[0]

    if prediction == -1:  # Anomaly detected
        anomaly_score = abs(score)

        # Build explanation
        sensor = reading.sensor
        zone = sensor.zone

        explanation = (
            f"Isolation Forest detected anomaly: value={reading.value} "
            f"for {sensor.get_sensor_type_display()} in {zone.name}. "
            f"Anomaly score: {anomaly_score:.3f}. "
            f"Model trained on {ml_model.training_samples} samples."
        )

        record = AnomalyRecord.objects.create(
            sensor=sensor,
            reading=reading,
            detection_method=AnomalyRecord.DetectionMethod.ISOLATION_FOREST,
            anomaly_score=round(anomaly_score, 4),
            value=reading.value,
            explanation=explanation,
        )

        # Create an alert
        Alert.objects.create(
            sensor=sensor,
            zone=zone,
            alert_type=Alert.AlertType.SENSOR_ERROR,
            severity=Alert.Severity.WARNING,
            value=reading.value,
            message=(
                f"ML anomaly detected: {sensor.get_sensor_type_display()} "
                f"in {zone.name} = {reading.value} "
                f"(anomaly score: {anomaly_score:.3f})"
            ),
        )

        logger.info(
            "ML anomaly detected: sensor=%s value=%s score=%s",
            sensor.pk,
            reading.value,
            anomaly_score,
        )
        return record

    return None


def detect_drift(sensor: Sensor, lookback_hours: int = 24) -> dict[str, Any] | None:
    """Detect drift using linear regression on recent data.

    Computes the slope of the trend line over the lookback period.
    If the predicted value in the next 6 hours crosses a threshold,
    a warning alert is generated.

    Args:
        sensor: The sensor to evaluate.
        lookback_hours: Hours of recent data to analyze.

    Returns:
        Dict with drift info, or None if insufficient data.
    """
    since = timezone.now() - timedelta(hours=lookback_hours)
    readings = list(
        SensorReading.objects.filter(
            sensor=sensor,
            received_at__gte=since,
        )
        .order_by("received_at")
        .values_list("received_at", "value")
    )

    if len(readings) < 10:
        return None

    base_time = readings[0][0]
    X = np.array([
        (t - base_time).total_seconds() / 3600.0
        for t, _ in readings
    ]).reshape(-1, 1)
    y = np.array([v for _, v in readings])

    lr = LinearRegression()
    lr.fit(X, y)

    slope_per_hour = float(lr.coef_[0])
    current_value = float(y[-1])
    predicted_6h = current_value + slope_per_hour * 6

    result = {
        "sensor_id": sensor.pk,
        "slope_per_hour": round(slope_per_hour, 4),
        "current_value": round(current_value, 2),
        "predicted_6h": round(predicted_6h, 2),
        "trend": "rising" if slope_per_hour > 0.01 else ("falling" if slope_per_hour < -0.01 else "stable"),
        "drift_alert": False,
    }

    # Check if predicted value will cross thresholds
    zone = sensor.zone
    if sensor.max_threshold is not None and predicted_6h > sensor.max_threshold:
        result["drift_alert"] = True
        Alert.objects.create(
            sensor=sensor,
            zone=zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
            severity=Alert.Severity.INFO,
            value=predicted_6h,
            message=(
                f"Drift prediction: {sensor.get_sensor_type_display()} in {zone.name} "
                f"trending towards {predicted_6h:.1f} in 6h "
                f"(threshold: {sensor.max_threshold}). "
                f"Slope: {slope_per_hour:.3f}/h"
            ),
        )

    if sensor.min_threshold is not None and predicted_6h < sensor.min_threshold:
        result["drift_alert"] = True
        Alert.objects.create(
            sensor=sensor,
            zone=zone,
            alert_type=Alert.AlertType.THRESHOLD_LOW,
            severity=Alert.Severity.INFO,
            value=predicted_6h,
            message=(
                f"Drift prediction: {sensor.get_sensor_type_display()} in {zone.name} "
                f"trending towards {predicted_6h:.1f} in 6h "
                f"(threshold: {sensor.min_threshold}). "
                f"Slope: {slope_per_hour:.3f}/h"
            ),
        )

    return result


def generate_smart_suggestions(sensor: Sensor, lookback_days: int = 7) -> list[SmartSuggestion]:
    """Generate threshold adjustment suggestions based on historical data.

    Analyzes the distribution of sensor values and recommends thresholds
    that would capture 95% of normal readings while flagging outliers.

    Args:
        sensor: The sensor to analyze.
        lookback_days: Days of history to consider.

    Returns:
        List of created SmartSuggestion instances.
    """
    since = timezone.now() - timedelta(days=lookback_days)
    values = list(
        SensorReading.objects.filter(
            sensor=sensor,
            received_at__gte=since,
        )
        .values_list("value", flat=True)
    )

    if len(values) < 50:
        return []

    mean_val = statistics.mean(values)
    stdev_val = statistics.stdev(values)
    p5 = float(np.percentile(values, 5))
    p95 = float(np.percentile(values, 95))

    suggestions = []

    # Suggest thresholds based on percentiles
    suggested_min = round(p5 - stdev_val * 0.5, 2)
    suggested_max = round(p95 + stdev_val * 0.5, 2)

    current_min = sensor.min_threshold
    current_max = sensor.max_threshold

    # Only suggest if significantly different from current thresholds
    needs_update = False
    if current_min is None or abs(current_min - suggested_min) > stdev_val * 0.3:
        needs_update = True
    if current_max is None or abs(current_max - suggested_max) > stdev_val * 0.3:
        needs_update = True

    if needs_update:
        message = (
            f"Based on {len(values)} readings over {lookback_days} days: "
            f"mean={mean_val:.2f}, stddev={stdev_val:.2f}. "
            f"Recommended thresholds: {suggested_min} — {suggested_max} "
            f"(covers 95% of normal values with buffer)."
        )

        suggestion = SmartSuggestion.objects.create(
            sensor=sensor,
            suggestion_type=SmartSuggestion.SuggestionType.THRESHOLD_ADJUST,
            message=message,
            suggested_min=suggested_min,
            suggested_max=suggested_max,
            confidence=min(0.95, len(values) / 1000),
        )
        suggestions.append(suggestion)

    # Check for trend-based suggestion
    drift = detect_drift(sensor)
    if drift and drift["trend"] != "stable":
        trend_msg = (
            f"Sensor {sensor.get_sensor_type_display()} shows a {drift['trend']} trend "
            f"(slope: {drift['slope_per_hour']}/h). "
            f"Current value: {drift['current_value']}, "
            f"predicted in 6h: {drift['predicted_6h']}."
        )
        suggestion = SmartSuggestion.objects.create(
            sensor=sensor,
            suggestion_type=SmartSuggestion.SuggestionType.TREND_WARNING,
            message=trend_msg,
            confidence=0.7,
        )
        suggestions.append(suggestion)

    return suggestions


def generate_weekly_ai_report(zone_id: int) -> str:
    """Generate a weekly AI report in natural language for a zone.

    Uses Jinja2 templates and computed statistics to produce a
    human-readable summary.

    Args:
        zone_id: The zone primary key.

    Returns:
        The rendered report text.
    """
    from .models import Zone

    try:
        zone = Zone.objects.get(pk=zone_id)
    except Zone.DoesNotExist:
        return ""

    sensors = Sensor.objects.filter(zone=zone, is_active=True)
    now = timezone.now()
    since = now - timedelta(days=7)

    sensor_reports = []
    for sensor in sensors:
        values = list(
            SensorReading.objects.filter(
                sensor=sensor,
                received_at__gte=since,
            )
            .values_list("value", flat=True)
        )

        if not values:
            sensor_reports.append({
                "name": sensor.get_sensor_type_display(),
                "unit": sensor.unit,
                "count": 0,
                "min": None,
                "max": None,
                "avg": None,
                "stddev": None,
                "trend": "unknown",
                "anomaly_count": 0,
            })
            continue

        mean_val = statistics.mean(values)
        stdev_val = statistics.stdev(values) if len(values) > 1 else 0

        anomaly_count = AnomalyRecord.objects.filter(
            sensor=sensor,
            detected_at__gte=since,
        ).count()

        # Compute trend
        drift = detect_drift(sensor)
        trend = drift["trend"] if drift else "unknown"

        sensor_reports.append({
            "name": sensor.get_sensor_type_display(),
            "unit": sensor.unit,
            "count": len(values),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "avg": round(mean_val, 2),
            "stddev": round(stdev_val, 2),
            "trend": trend,
            "anomaly_count": anomaly_count,
        })

    alert_count = Alert.objects.filter(
        zone=zone,
        created_at__gte=since,
    ).count()

    # Use Jinja2 template
    import jinja2

    template_str = """Weekly AI Report — {{ zone_name }}
Period: {{ since }} to {{ now }}
========================================

{% for s in sensors %}
{{ s.name }} ({{ s.unit }}):
{% if s.count == 0 %}  No data recorded this week.
{% else %}  Readings: {{ s.count }}
  Range: {{ s.min }} — {{ s.max }}
  Average: {{ s.avg }} (±{{ s.stddev }})
  Trend: {{ s.trend }}
{% if s.anomaly_count > 0 %}  ⚠ {{ s.anomaly_count }} anomalies detected
{% endif %}{% endif %}
{% endfor %}
Summary:
  Total alerts this week: {{ alert_count }}
{% if total_anomalies > 0 %}  Total anomalies detected: {{ total_anomalies }}
{% endif %}
{% if rising_sensors %}Attention: {{ rising_sensors|join(', ') }} showing rising trend.
{% endif %}{% if falling_sensors %}Attention: {{ falling_sensors|join(', ') }} showing falling trend.
{% endif %}
Report generated automatically by Greenhouse AI.
"""

    env = jinja2.Environment(autoescape=False)
    template = env.from_string(template_str)

    total_anomalies = sum(s["anomaly_count"] for s in sensor_reports)
    rising_sensors = [s["name"] for s in sensor_reports if s["trend"] == "rising"]
    falling_sensors = [s["name"] for s in sensor_reports if s["trend"] == "falling"]

    report = template.render(
        zone_name=zone.name,
        since=since.strftime("%Y-%m-%d"),
        now=now.strftime("%Y-%m-%d"),
        sensors=sensor_reports,
        alert_count=alert_count,
        total_anomalies=total_anomalies,
        rising_sensors=rising_sensors,
        falling_sensors=falling_sensors,
    )

    return report
