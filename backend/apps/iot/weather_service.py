"""Open-Meteo weather API integration service.

Fetches current and forecast weather data for Site locations using the
free Open-Meteo API (https://open-meteo.com/). No API key required.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from django.utils import timezone as django_tz

logger = logging.getLogger(__name__)

OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT = 15


def fetch_weather(
    latitude: float,
    longitude: float,
    timezone_str: str = "UTC",
    forecast_days: int = 3,
) -> dict[str, Any] | None:
    """Fetch current and forecast weather from Open-Meteo.

    Args:
        latitude: Site latitude.
        longitude: Site longitude.
        timezone_str: IANA timezone for the site.
        forecast_days: Number of forecast days (1-7).

    Returns:
        Parsed JSON response or None on failure.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone_str,
        "current": ",".join([
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "wind_speed_10m",
            "uv_index",
            "cloud_cover",
            "weather_code",
        ]),
        "hourly": ",".join([
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "wind_speed_10m",
            "uv_index",
            "cloud_cover",
            "weather_code",
        ]),
        "forecast_days": forecast_days,
    }
    try:
        response = requests.get(
            OPEN_METEO_BASE_URL,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        logger.exception("Failed to fetch weather data from Open-Meteo")
        return None


def parse_current_weather(data: dict[str, Any]) -> dict[str, Any] | None:
    """Extract current weather conditions from Open-Meteo response.

    Returns:
        Dict with normalized weather fields or None if parsing fails.
    """
    current = data.get("current")
    if not current:
        return None

    return {
        "timestamp": current.get("time"),
        "temperature": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "precipitation": current.get("precipitation"),
        "wind_speed": current.get("wind_speed_10m"),
        "uv_index": current.get("uv_index"),
        "cloud_cover": current.get("cloud_cover"),
        "weather_code": current.get("weather_code"),
        "is_forecast": False,
    }


def parse_hourly_forecast(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract hourly forecast data from Open-Meteo response.

    Returns:
        List of dicts with normalized weather fields.
    """
    hourly = data.get("hourly")
    if not hourly:
        return []

    timestamps = hourly.get("time", [])
    results = []
    for i, ts in enumerate(timestamps):
        results.append({
            "timestamp": ts,
            "temperature": _safe_get(hourly, "temperature_2m", i),
            "humidity": _safe_get(hourly, "relative_humidity_2m", i),
            "precipitation": _safe_get(hourly, "precipitation", i),
            "wind_speed": _safe_get(hourly, "wind_speed_10m", i),
            "uv_index": _safe_get(hourly, "uv_index", i),
            "cloud_cover": _safe_get(hourly, "cloud_cover", i),
            "weather_code": _safe_get(hourly, "weather_code", i),
            "is_forecast": True,
        })
    return results


def _safe_get(data: dict, key: str, index: int) -> Any:
    """Safely get a value from an array in a dict."""
    arr = data.get(key, [])
    if index < len(arr):
        return arr[index]
    return None


def analyze_forecast_for_alerts(
    hourly_data: list[dict[str, Any]],
    site_name: str,
) -> list[dict[str, Any]]:
    """Analyze forecast data for geo-contextual weather alerts.

    Detects:
    - Heatwave: temperature > 35°C for multiple hours
    - Frost: temperature < 0°C
    - Heavy rain: precipitation > 10mm/h
    - High UV: UV index > 8

    Args:
        hourly_data: Parsed hourly forecast entries.
        site_name: Name of the site for alert messages.

    Returns:
        List of alert dicts with title, message, alert_level, forecast_date.
    """
    alerts: list[dict[str, Any]] = []
    seen_dates: set[tuple[str, str]] = set()

    for entry in hourly_data:
        ts_str = entry.get("timestamp", "")
        try:
            dt = datetime.fromisoformat(ts_str)
        except (ValueError, TypeError):
            continue

        date_str = dt.date().isoformat()

        # Heatwave detection
        temp = entry.get("temperature")
        if temp is not None and temp > 35.0:
            key = ("heatwave", date_str)
            if key not in seen_dates:
                seen_dates.add(key)
                alerts.append({
                    "alert_level": "CRITICAL",
                    "title": f"Heatwave forecast for {site_name}",
                    "message": (
                        f"Temperature expected to reach {temp:.1f}°C on {date_str}. "
                        "Consider adjusting ventilation and irrigation thresholds."
                    ),
                    "forecast_date": date_str,
                })

        # Frost detection
        if temp is not None and temp < 0.0:
            key = ("frost", date_str)
            if key not in seen_dates:
                seen_dates.add(key)
                alerts.append({
                    "alert_level": "CRITICAL",
                    "title": f"Frost warning for {site_name}",
                    "message": (
                        f"Temperature expected to drop to {temp:.1f}°C on {date_str}. "
                        "Consider activating heaters."
                    ),
                    "forecast_date": date_str,
                })

        # Heavy rain
        precip = entry.get("precipitation")
        if precip is not None and precip > 10.0:
            key = ("heavy_rain", date_str)
            if key not in seen_dates:
                seen_dates.add(key)
                alerts.append({
                    "alert_level": "WARNING",
                    "title": f"Heavy rain forecast for {site_name}",
                    "message": (
                        f"Precipitation of {precip:.1f}mm/h expected on {date_str}. "
                        "Review drainage and irrigation schedules."
                    ),
                    "forecast_date": date_str,
                })

        # High UV
        uv = entry.get("uv_index")
        if uv is not None and uv > 8.0:
            key = ("high_uv", date_str)
            if key not in seen_dates:
                seen_dates.add(key)
                alerts.append({
                    "alert_level": "WARNING",
                    "title": f"High UV index forecast for {site_name}",
                    "message": (
                        f"UV index expected to reach {uv:.1f} on {date_str}. "
                        "Consider activating shade screens."
                    ),
                    "forecast_date": date_str,
                })

    return alerts


WMO_WEATHER_CODES: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def weather_code_description(code: int | None) -> str:
    """Convert a WMO weather code to a human-readable description."""
    if code is None:
        return "Unknown"
    return WMO_WEATHER_CODES.get(code, f"Code {code}")
