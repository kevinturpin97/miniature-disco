"""Crop Intelligence & Plant Health Engine — Sprint 31.

All computations are pure functions that accept scalar sensor values so they
can be unit-tested without touching the database.  The Celery task
``calculate_crop_status`` orchestrates the DB queries and delegates to these
helpers.

Algorithms
----------
* **GDD** (Growing Degree Days): ``max(0, (T_max + T_min) / 2 - T_base)``.
  T_base defaults to 10 °C (generic vegetable crop baseline).
* **Evapotranspiration (ET₀)**: simplified Hargreaves-Samani approximation
  using only available sensor data: ``ET₀ = 0.0023 × (T_mean + 17.8) × (T_max - T_min) ^ 0.5``.
  Without radiation data we drop the radiation term and use a fixed daily
  time-step; the result is an *order-of-magnitude* estimate suitable for
  irrigation guidance.
* **Heat Index**: NOAA simplified formula (valid for T ≥ 27 °C, RH ≥ 40 %).
  Below threshold, heat index ≡ temperature (no stress).
* **Downy Mildew risk**: based on temperature (15–25 °C optimal range) and
  humidity > 85 % sustained conditions.  Risk score maps to LOW/MODERATE/HIGH.
* **Plant Health Score**: weighted sum of individual component scores (0-100).
* **Yield Prediction**: product of normalised growth, hydration and light
  scores expressed as a signed percentage deviation from baseline.
"""

from __future__ import annotations

import math
from typing import Optional


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GDD_T_BASE = 10.0  # °C default base temperature
LIGHT_OPTIMAL_LUX = 25_000  # lux — optimal level for most greenhouse crops
LIGHT_MINIMUM_LUX = 5_000   # lux — minimum acceptable
CO2_OPTIMAL_PPM = 800       # ppm — enriched greenhouse target
CO2_ADEQUATE_PPM = 400      # ppm — ambient baseline


# ---------------------------------------------------------------------------
# Growth — Growing Degree Days
# ---------------------------------------------------------------------------

def calc_gdd(t_max: float, t_min: float, t_base: float = GDD_T_BASE) -> float:
    """Calculate daily GDD contribution.

    Args:
        t_max: Maximum temperature of the period (°C).
        t_min: Minimum temperature of the period (°C).
        t_base: Base temperature for the crop (°C).

    Returns:
        GDD value ≥ 0.
    """
    t_mean = (t_max + t_min) / 2.0
    return max(0.0, t_mean - t_base)


def growth_status_from_gdd(daily_gdd: float) -> str:
    """Map a daily GDD value to a growth status string.

    Args:
        daily_gdd: GDD units for the current day/period.

    Returns:
        One of ``'SLOW'``, ``'NORMAL'``, ``'FAST'``.
    """
    if daily_gdd < 3.0:
        return "SLOW"
    if daily_gdd < 10.0:
        return "NORMAL"
    return "FAST"


# ---------------------------------------------------------------------------
# Hydration — Evapotranspiration (simplified Hargreaves-Samani)
# ---------------------------------------------------------------------------

def calc_evapotranspiration(t_mean: float, t_max: float, t_min: float) -> float:
    """Estimate reference ET₀ (mm/day) using the Hargreaves-Samani method.

    Only temperature data are required, making this suitable for sensor
    deployments without solar radiation measurement.

    Args:
        t_mean: Mean temperature (°C).
        t_max: Maximum temperature (°C).
        t_min: Minimum temperature (°C).

    Returns:
        ET₀ in mm/day (always ≥ 0).
    """
    delta_t = max(0.0, t_max - t_min)
    et0 = 0.0023 * (t_mean + 17.8) * math.sqrt(delta_t)
    return max(0.0, et0)


def hydration_status_from_et_and_soil(et0: float, soil_humidity: Optional[float]) -> str:
    """Derive hydration status from ET₀ and soil humidity.

    Args:
        et0: Reference evapotranspiration (mm/day).
        soil_humidity: Soil humidity sensor reading (% 0-100), or None.

    Returns:
        One of ``'DRY'``, ``'CORRECT'``, ``'OPTIMAL'``, ``'EXCESS'``, ``'UNKNOWN'``.
    """
    if soil_humidity is None:
        # Fall back to ET₀-only assessment
        if et0 > 6.0:
            return "DRY"
        if et0 > 3.0:
            return "CORRECT"
        return "OPTIMAL"

    if soil_humidity < 30.0:
        return "DRY"
    if soil_humidity < 50.0:
        return "CORRECT"
    if soil_humidity <= 75.0:
        return "OPTIMAL"
    return "EXCESS"


def irrigation_needed_liters(et0: float, soil_humidity: Optional[float]) -> Optional[float]:
    """Estimate irrigation need in litres per plant per day.

    Uses a simplified model: 0.5 L base × ET₀ factor, reduced if soil is wet.

    Args:
        et0: ET₀ mm/day.
        soil_humidity: Soil humidity (%) or None.

    Returns:
        Litres per plant, or None if data is insufficient.
    """
    base = 0.5 * et0  # L/plant rough baseline
    if soil_humidity is not None:
        # Reduce need proportionally to existing soil moisture
        reduction = min(1.0, soil_humidity / 75.0)
        base = max(0.0, base * (1.0 - reduction * 0.6))
    return round(base, 2)


# ---------------------------------------------------------------------------
# Heat Stress — NOAA simplified Heat Index
# ---------------------------------------------------------------------------

def calc_heat_index(temperature: float, humidity: float) -> float:
    """Calculate the NOAA simplified Heat Index.

    Valid for T ≥ 27 °C and RH ≥ 40 %.  Returns temperature unchanged below
    threshold (no additional thermal load).

    Args:
        temperature: Air temperature in °C.
        humidity: Relative humidity in %.

    Returns:
        Heat index in °C.
    """
    if temperature < 27.0 or humidity < 40.0:
        return temperature

    T = temperature * 9 / 5 + 32  # Convert to °F for the NOAA formula
    R = humidity
    hi_f = (
        -42.379
        + 2.04901523 * T
        + 10.14333127 * R
        - 0.22475541 * T * R
        - 0.00683783 * T ** 2
        - 0.05481717 * R ** 2
        + 0.00122874 * T ** 2 * R
        + 0.00085282 * T * R ** 2
        - 0.00000199 * T ** 2 * R ** 2
    )
    return (hi_f - 32) * 5 / 9  # Back to °C


def heat_stress_level(heat_index: float) -> str:
    """Classify heat stress level from heat index.

    Args:
        heat_index: Heat index in °C.

    Returns:
        One of ``'NONE'``, ``'LIGHT'``, ``'HIGH'``, ``'CRITICAL'``.
    """
    if heat_index < 27.0:
        return "NONE"
    if heat_index < 32.0:
        return "LIGHT"
    if heat_index < 40.0:
        return "HIGH"
    return "CRITICAL"


# ---------------------------------------------------------------------------
# Disease Risk — Downy Mildew model
# ---------------------------------------------------------------------------

def disease_risk_level(temperature: float, humidity: float) -> str:
    """Estimate fungal / downy mildew disease risk from temperature and humidity.

    Conditions for high risk: humidity > 85 %, temperature between 15–25 °C.

    Args:
        temperature: Air temperature (°C).
        humidity: Relative humidity (%).

    Returns:
        One of ``'LOW'``, ``'MODERATE'``, ``'HIGH'``.
    """
    temp_in_range = 12.0 <= temperature <= 28.0
    if humidity >= 90.0 and temp_in_range:
        return "HIGH"
    if humidity >= 80.0 and temp_in_range:
        return "MODERATE"
    return "LOW"


# ---------------------------------------------------------------------------
# Climate Stress
# ---------------------------------------------------------------------------

def climate_stress_level(temperature: float, humidity: float) -> str:
    """Evaluate combined climate stress from temperature and humidity extremes.

    Args:
        temperature: Air temperature (°C).
        humidity: Relative humidity (%).

    Returns:
        One of ``'NONE'``, ``'LIGHT'``, ``'HIGH'``, ``'CRITICAL'``.
    """
    score = 0

    # Temperature extremes
    if temperature > 35.0 or temperature < 5.0:
        score += 3
    elif temperature > 30.0 or temperature < 10.0:
        score += 2
    elif temperature > 28.0 or temperature < 14.0:
        score += 1

    # Humidity extremes
    if humidity > 95.0 or humidity < 20.0:
        score += 3
    elif humidity > 90.0 or humidity < 30.0:
        score += 2
    elif humidity > 85.0 or humidity < 40.0:
        score += 1

    if score >= 5:
        return "CRITICAL"
    if score >= 3:
        return "HIGH"
    if score >= 1:
        return "LIGHT"
    return "NONE"


# ---------------------------------------------------------------------------
# Light Availability
# ---------------------------------------------------------------------------

def light_level_status(lux: Optional[float]) -> str:
    """Classify light availability from lux sensor reading.

    Args:
        lux: Light intensity in lux, or None if sensor absent.

    Returns:
        One of ``'INSUFFICIENT'``, ``'CORRECT'``, ``'OPTIMAL'``, ``'UNKNOWN'``.
    """
    if lux is None:
        return "UNKNOWN"
    if lux < LIGHT_MINIMUM_LUX:
        return "INSUFFICIENT"
    if lux < LIGHT_OPTIMAL_LUX:
        return "CORRECT"
    return "OPTIMAL"


# ---------------------------------------------------------------------------
# Harvest ETA
# ---------------------------------------------------------------------------

def harvest_eta_days(
    gdd_accumulated: Optional[float],
    gdd_target: float = 1200.0,
    daily_gdd_estimate: Optional[float] = None,
) -> Optional[int]:
    """Estimate days until harvest based on GDD accumulation.

    Args:
        gdd_accumulated: Total GDD units accumulated so far.
        gdd_target: GDD threshold for harvest (default 1200 for tomatoes).
        daily_gdd_estimate: Recent daily GDD rate for projection.

    Returns:
        Estimated days remaining, or None if insufficient data.
    """
    if gdd_accumulated is None or daily_gdd_estimate is None or daily_gdd_estimate <= 0:
        return None
    remaining = max(0.0, gdd_target - gdd_accumulated)
    return int(math.ceil(remaining / daily_gdd_estimate))


# ---------------------------------------------------------------------------
# Plant Health Score
# ---------------------------------------------------------------------------

def plant_health_score(
    temperature: float,
    humidity: float,
    soil_humidity: Optional[float] = None,
    lux: Optional[float] = None,
    co2: Optional[float] = None,
) -> float:
    """Compute an overall plant health score (0-100).

    Weighted sum of individual component scores:
    - Temperature (25 pts)
    - Air humidity (20 pts)
    - Soil humidity (20 pts)
    - Light (20 pts)
    - CO₂ (15 pts)

    Args:
        temperature: Air temperature (°C).
        humidity: Air relative humidity (%).
        soil_humidity: Soil moisture (%) or None.
        lux: Light intensity (lux) or None.
        co2: CO₂ concentration (ppm) or None.

    Returns:
        Score between 0 and 100.
    """
    score = 0.0

    # Temperature score — optimal 18-26 °C
    if 18.0 <= temperature <= 26.0:
        score += 25.0
    elif 14.0 <= temperature <= 30.0:
        score += 15.0
    elif 10.0 <= temperature <= 35.0:
        score += 5.0

    # Air humidity — optimal 50-70 %
    if 50.0 <= humidity <= 70.0:
        score += 20.0
    elif 40.0 <= humidity <= 80.0:
        score += 12.0
    elif 30.0 <= humidity <= 90.0:
        score += 5.0

    # Soil humidity — optimal 50-70 %
    if soil_humidity is not None:
        if 50.0 <= soil_humidity <= 70.0:
            score += 20.0
        elif 35.0 <= soil_humidity <= 80.0:
            score += 12.0
        elif 20.0 <= soil_humidity <= 90.0:
            score += 5.0
    else:
        # No sensor: award partial credit
        score += 10.0

    # Light score
    if lux is not None:
        if lux >= LIGHT_OPTIMAL_LUX:
            score += 20.0
        elif lux >= LIGHT_MINIMUM_LUX:
            score += 12.0
        elif lux > 1_000:
            score += 5.0
    else:
        score += 10.0

    # CO₂ score
    if co2 is not None:
        if co2 >= CO2_OPTIMAL_PPM:
            score += 15.0
        elif co2 >= CO2_ADEQUATE_PPM:
            score += 10.0
        elif co2 > 250:
            score += 4.0
    else:
        score += 7.5

    return round(min(100.0, score), 1)


# ---------------------------------------------------------------------------
# Yield Prediction
# ---------------------------------------------------------------------------

def yield_prediction_score(
    growth_status: str,
    hydration_status: str,
    light_status: str,
) -> float:
    """Compute a yield prediction as a percentage deviation from baseline.

    Positive values indicate above-average yield potential; negative means risk.

    Args:
        growth_status: One of SLOW/NORMAL/FAST.
        hydration_status: One of DRY/CORRECT/OPTIMAL/EXCESS.
        light_status: One of INSUFFICIENT/CORRECT/OPTIMAL/UNKNOWN.

    Returns:
        Yield prediction score (%).  Range approximately -60 to +20.
    """
    growth_map = {"SLOW": -15.0, "NORMAL": 0.0, "FAST": 10.0, "UNKNOWN": 0.0}
    hydration_map = {"DRY": -25.0, "CORRECT": 0.0, "OPTIMAL": 10.0, "EXCESS": -10.0, "UNKNOWN": 0.0}
    light_map = {"INSUFFICIENT": -20.0, "CORRECT": 0.0, "OPTIMAL": 10.0, "UNKNOWN": 0.0}

    return round(
        growth_map.get(growth_status, 0.0)
        + hydration_map.get(hydration_status, 0.0)
        + light_map.get(light_status, 0.0),
        1,
    )
