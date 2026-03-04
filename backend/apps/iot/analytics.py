"""Analytics computation module for zone-level and org-level statistics.

Provides functions to compute stats (min, max, avg, stddev, trend) from
sensor readings, detect anomalies via z-score, and generate PDF reports.
"""

from __future__ import annotations

import math
import statistics
from datetime import datetime, timedelta
from typing import Any

from django.db.models import Avg, Count, Max, Min, StdDev
from django.db.models.functions import TruncDay, TruncHour
from django.utils import timezone

from .models import (
    Alert,
    Sensor,
    SensorReading,
    SensorReadingHourly,
    Zone,
)


def compute_zone_analytics(
    zone: Zone,
    days: int = 7,
) -> dict[str, Any]:
    """Compute analytics for all sensors in a zone over a period.

    Args:
        zone: The Zone instance.
        days: Number of days to look back (7 or 30).

    Returns:
        Dict with per-sensor stats and zone-level summary.
    """
    since = timezone.now() - timedelta(days=days)
    sensors = Sensor.objects.filter(zone=zone, is_active=True)

    sensor_stats: list[dict[str, Any]] = []

    for sensor in sensors:
        readings = SensorReading.objects.filter(
            sensor=sensor,
            received_at__gte=since,
        ).order_by("received_at")

        count = readings.count()
        if count == 0:
            sensor_stats.append({
                "sensor_id": sensor.pk,
                "sensor_type": sensor.sensor_type,
                "label": sensor.label,
                "unit": sensor.unit,
                "count": 0,
                "min": None,
                "max": None,
                "avg": None,
                "stddev": None,
                "trend": None,
                "daily_averages": [],
            })
            continue

        agg = readings.aggregate(
            min_val=Min("value"),
            max_val=Max("value"),
            avg_val=Avg("value"),
            stddev_val=StdDev("value"),
            reading_count=Count("id"),
        )

        # Compute trend via simple linear regression on daily averages
        daily = list(
            readings
            .annotate(day=TruncDay("received_at"))
            .values("day")
            .annotate(avg_val=Avg("value"))
            .order_by("day")
        )

        trend = _compute_trend(daily)

        sensor_stats.append({
            "sensor_id": sensor.pk,
            "sensor_type": sensor.sensor_type,
            "label": sensor.label,
            "unit": sensor.unit,
            "count": agg["reading_count"],
            "min": _round(agg["min_val"]),
            "max": _round(agg["max_val"]),
            "avg": _round(agg["avg_val"]),
            "stddev": _round(agg["stddev_val"]),
            "trend": trend,
            "daily_averages": [
                {"date": d["day"].isoformat(), "avg": _round(d["avg_val"])}
                for d in daily
            ],
        })

    return {
        "zone_id": zone.pk,
        "zone_name": zone.name,
        "period_days": days,
        "since": since.isoformat(),
        "sensors": sensor_stats,
    }


def compute_org_analytics_summary(org_id: int) -> dict[str, Any]:
    """Compute a high-level analytics summary across all greenhouses of an org.

    Args:
        org_id: The Organization primary key.

    Returns:
        Dict with greenhouse/zone counts, total readings, active alerts, etc.
    """
    from .models import Greenhouse

    now = timezone.now()
    since_7d = now - timedelta(days=7)

    greenhouses = Greenhouse.objects.filter(organization_id=org_id)
    zones = Zone.objects.filter(greenhouse__organization_id=org_id)
    zone_ids = list(zones.values_list("id", flat=True))

    total_readings_7d = SensorReading.objects.filter(
        sensor__zone_id__in=zone_ids,
        received_at__gte=since_7d,
    ).count()

    active_alerts = Alert.objects.filter(
        zone_id__in=zone_ids,
        is_acknowledged=False,
    ).count()

    zones_online = zones.filter(
        last_seen__gte=now - timedelta(seconds=600),
    ).count()

    # Per-greenhouse summary
    gh_summaries = []
    for gh in greenhouses.prefetch_related("zones"):
        gh_zone_ids = list(gh.zones.values_list("id", flat=True))
        gh_readings = SensorReading.objects.filter(
            sensor__zone_id__in=gh_zone_ids,
            received_at__gte=since_7d,
        ).count() if gh_zone_ids else 0

        gh_alerts = Alert.objects.filter(
            zone_id__in=gh_zone_ids,
            is_acknowledged=False,
        ).count() if gh_zone_ids else 0

        gh_summaries.append({
            "greenhouse_id": gh.pk,
            "greenhouse_name": gh.name,
            "zone_count": len(gh_zone_ids),
            "readings_7d": gh_readings,
            "active_alerts": gh_alerts,
        })

    return {
        "greenhouse_count": greenhouses.count(),
        "zone_count": zones.count(),
        "zones_online": zones_online,
        "total_readings_7d": total_readings_7d,
        "active_alerts": active_alerts,
        "greenhouses": gh_summaries,
    }


def detect_anomalies(reading: SensorReading, lookback_hours: int = 24) -> bool:
    """Detect anomalies using z-score > 3 standard deviations.

    Compares the reading value against the mean/stddev of recent readings
    for the same sensor. Creates a SENSOR_ERROR alert if anomalous.

    Args:
        reading: The SensorReading to evaluate.
        lookback_hours: How many hours of history to consider.

    Returns:
        True if the reading was flagged as anomalous.
    """
    sensor = reading.sensor
    since = reading.received_at - timedelta(hours=lookback_hours)

    recent = list(
        SensorReading.objects.filter(
            sensor=sensor,
            received_at__gte=since,
        )
        .exclude(pk=reading.pk)
        .values_list("value", flat=True)
    )

    if len(recent) < 10:
        # Not enough data for meaningful statistics
        return False

    mean = statistics.mean(recent)
    stdev = statistics.stdev(recent)

    if stdev == 0:
        return False

    z_score = abs(reading.value - mean) / stdev

    if z_score > 3:
        zone = sensor.zone
        Alert.objects.create(
            sensor=sensor,
            zone=zone,
            alert_type=Alert.AlertType.SENSOR_ERROR,
            severity=Alert.Severity.WARNING,
            value=reading.value,
            message=(
                f"Anomaly detected on {sensor.get_sensor_type_display()} in {zone.name}: "
                f"value {reading.value} (z-score: {z_score:.1f}, "
                f"mean: {mean:.2f}, stddev: {stdev:.2f})"
            ),
        )
        return True

    return False


def aggregate_hourly_readings() -> dict[str, int]:
    """Aggregate raw sensor readings into hourly buckets.

    Processes readings from the last 2 hours that haven't been aggregated
    yet. Uses INSERT ... ON CONFLICT (upsert) logic via update_or_create.

    Returns:
        Dict with ``sensors_processed`` and ``buckets_created`` counts.
    """
    now = timezone.now()
    # Process the last 2 hours to handle late-arriving data
    since = now - timedelta(hours=2)

    sensors = Sensor.objects.filter(is_active=True)
    sensors_processed = 0
    buckets_created = 0

    for sensor in sensors:
        hourly_data = (
            SensorReading.objects.filter(
                sensor=sensor,
                received_at__gte=since,
            )
            .annotate(hour_bucket=TruncHour("received_at"))
            .values("hour_bucket")
            .annotate(
                avg_val=Avg("value"),
                min_val=Min("value"),
                max_val=Max("value"),
                stddev_val=StdDev("value"),
                cnt=Count("id"),
            )
            .order_by("hour_bucket")
        )

        for bucket in hourly_data:
            _, created = SensorReadingHourly.objects.update_or_create(
                sensor=sensor,
                hour=bucket["hour_bucket"],
                defaults={
                    "avg_value": bucket["avg_val"] or 0,
                    "min_value": bucket["min_val"] or 0,
                    "max_value": bucket["max_val"] or 0,
                    "stddev_value": bucket["stddev_val"] or 0,
                    "count": bucket["cnt"],
                },
            )
            if created:
                buckets_created += 1

        sensors_processed += 1

    return {"sensors_processed": sensors_processed, "buckets_created": buckets_created}


def _compute_trend(daily_averages: list[dict]) -> str | None:
    """Compute trend direction from daily averages via linear regression slope.

    Returns:
        ``"rising"``, ``"falling"``, or ``"stable"`` (or None if insufficient data).
    """
    if len(daily_averages) < 2:
        return None

    values = [d["avg_val"] for d in daily_averages]
    n = len(values)
    x_values = list(range(n))
    x_mean = sum(x_values) / n
    y_mean = sum(values) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, values))
    denominator = sum((x - x_mean) ** 2 for x in x_values)

    if denominator == 0:
        return "stable"

    slope = numerator / denominator

    # Normalize slope by range of values to determine significance
    val_range = max(values) - min(values) if max(values) != min(values) else 1
    normalized_slope = abs(slope) / val_range

    if normalized_slope < 0.05:
        return "stable"
    return "rising" if slope > 0 else "falling"


def _round(value: float | None, decimals: int = 2) -> float | None:
    """Round a value, handling None."""
    if value is None:
        return None
    return round(value, decimals)
