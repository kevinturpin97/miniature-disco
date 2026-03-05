"""Tests for Sprint 24 — Multi-Site & Cartography.

Covers:
- Site CRUD endpoints
- Organization isolation
- Weather data storage and retrieval
- Weather alerts (creation, listing, acknowledgement)
- Weather service parsing functions (parse_current_weather, parse_hourly_forecast,
  analyze_forecast_for_alerts, weather_code_description)
- Weather correlation endpoint
- Site dashboard endpoint
"""

from datetime import date, datetime, timedelta
from unittest.mock import patch

import factory
import pytest
from django.utils import timezone as django_tz

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Greenhouse,
    Sensor,
    SensorReadingHourly,
    Site,
    WeatherAlert,
    WeatherData,
    Zone,
)
from apps.iot.weather_service import (
    analyze_forecast_for_alerts,
    parse_current_weather,
    parse_hourly_forecast,
    weather_code_description,
)
from conftest import (
    GreenhouseFactory,
    MembershipFactory,
    OrganizationFactory,
    SensorFactory,
    SiteFactory,
    UserFactory,
    ZoneFactory,
)


# ---------------------------------------------------------------------------
# Local factories
# ---------------------------------------------------------------------------


class WeatherDataFactory(factory.django.DjangoModelFactory):
    """Factory for creating WeatherData instances."""

    class Meta:
        model = WeatherData

    site = factory.SubFactory(SiteFactory)
    timestamp = factory.LazyFunction(django_tz.now)
    temperature = 22.5
    humidity = 65.0
    precipitation = 0.0
    wind_speed = 12.0
    uv_index = 5.0
    cloud_cover = 40.0
    weather_code = 2
    is_forecast = False


class WeatherAlertFactory(factory.django.DjangoModelFactory):
    """Factory for creating WeatherAlert instances."""

    class Meta:
        model = WeatherAlert

    site = factory.SubFactory(SiteFactory)
    alert_level = WeatherAlert.AlertLevel.WARNING
    title = "Test weather alert"
    message = "This is a test weather alert."
    forecast_date = factory.LazyFunction(date.today)
    is_acknowledged = False


# ---------------------------------------------------------------------------
# Helper: build mock Open-Meteo response
# ---------------------------------------------------------------------------

MOCK_OPEN_METEO_RESPONSE = {
    "current": {
        "time": "2025-07-15T14:00",
        "temperature_2m": 28.3,
        "relative_humidity_2m": 55,
        "precipitation": 0.0,
        "wind_speed_10m": 8.5,
        "uv_index": 6.2,
        "cloud_cover": 30,
        "weather_code": 2,
    },
    "hourly": {
        "time": [
            "2025-07-15T00:00",
            "2025-07-15T01:00",
            "2025-07-15T02:00",
        ],
        "temperature_2m": [22.0, 21.5, 21.0],
        "relative_humidity_2m": [70, 72, 75],
        "precipitation": [0.0, 0.0, 0.2],
        "wind_speed_10m": [5.0, 4.5, 4.0],
        "uv_index": [0.0, 0.0, 0.0],
        "cloud_cover": [20, 25, 30],
        "weather_code": [0, 1, 2],
    },
}


# ===========================================================================
# Site CRUD Tests
# ===========================================================================


@pytest.mark.django_db
class TestSiteCRUD:
    """Test basic CRUD operations for the Site resource."""

    list_url = "/api/sites/"

    def detail_url(self, pk: int) -> str:
        return f"/api/sites/{pk}/"

    # -- Authentication ---

    def test_list_requires_auth(self, api_client):
        """Unauthenticated requests should be rejected."""
        assert api_client.get(self.list_url).status_code == 401

    def test_create_requires_auth(self, api_client):
        """Unauthenticated POST should be rejected."""
        resp = api_client.post(self.list_url, {"name": "X", "latitude": 0, "longitude": 0})
        assert resp.status_code == 401

    # -- List ---

    def test_list_empty(self, auth_client):
        """List should return empty results when no sites exist."""
        resp = auth_client.get(self.list_url)
        assert resp.status_code == 200
        assert resp.data["count"] == 0

    def test_list_returns_own_sites(self, auth_client, site):
        """User should see their own sites."""
        resp = auth_client.get(self.list_url)
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["id"] == site.pk

    def test_list_excludes_other_org_sites(self, auth_client, other_user):
        """User should not see sites belonging to another organization."""
        other_org = Membership.objects.filter(user=other_user).first().organization
        SiteFactory(organization=other_org)
        resp = auth_client.get(self.list_url)
        assert resp.status_code == 200
        assert resp.data["count"] == 0

    # -- Create ---

    def test_create_site(self, auth_client, user):
        """Creating a site should succeed with valid data."""
        payload = {
            "name": "Main Farm",
            "address": "456 Farm Road",
            "latitude": 45.7640,
            "longitude": 4.8357,
            "timezone": "Europe/Paris",
        }
        resp = auth_client.post(self.list_url, payload)
        assert resp.status_code == 201
        assert resp.data["name"] == "Main Farm"
        assert resp.data["latitude"] == 45.7640
        assert resp.data["longitude"] == 4.8357
        assert resp.data["timezone"] == "Europe/Paris"
        assert resp.data["is_active"] is True

    def test_create_site_validates_latitude(self, auth_client):
        """Latitude must be between -90 and 90."""
        payload = {"name": "Bad", "latitude": 100.0, "longitude": 0.0}
        resp = auth_client.post(self.list_url, payload)
        assert resp.status_code == 400

    def test_create_site_validates_longitude(self, auth_client):
        """Longitude must be between -180 and 180."""
        payload = {"name": "Bad", "latitude": 0.0, "longitude": 200.0}
        resp = auth_client.post(self.list_url, payload)
        assert resp.status_code == 400

    def test_create_site_minimal(self, auth_client):
        """Creating a site with only required fields should work."""
        payload = {"name": "Minimal", "latitude": 0.0, "longitude": 0.0}
        resp = auth_client.post(self.list_url, payload)
        assert resp.status_code == 201
        assert resp.data["timezone"] == "UTC"
        assert resp.data["address"] == ""

    # -- Retrieve ---

    def test_retrieve_site(self, auth_client, site):
        """Retrieve should return the correct site data."""
        resp = auth_client.get(self.detail_url(site.pk))
        assert resp.status_code == 200
        assert resp.data["id"] == site.pk
        assert resp.data["name"] == site.name
        assert "greenhouse_count" in resp.data

    def test_retrieve_other_org_site_denied(self, other_auth_client, site):
        """Retrieving a site from another org should return 404."""
        resp = other_auth_client.get(self.detail_url(site.pk))
        assert resp.status_code == 404

    # -- Update ---

    def test_partial_update_site(self, auth_client, site):
        """PATCH should update the specified fields."""
        resp = auth_client.patch(
            self.detail_url(site.pk),
            {"name": "Updated Site", "address": "New Address"},
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Updated Site"
        assert resp.data["address"] == "New Address"

    def test_update_other_org_site_denied(self, other_auth_client, site):
        """Updating a site from another org should return 404."""
        resp = other_auth_client.patch(self.detail_url(site.pk), {"name": "Hacked"})
        assert resp.status_code == 404

    # -- Delete ---

    def test_delete_site(self, auth_client, site):
        """DELETE should remove the site."""
        resp = auth_client.delete(self.detail_url(site.pk))
        assert resp.status_code == 204
        assert not Site.objects.filter(pk=site.pk).exists()

    def test_delete_other_org_site_denied(self, other_auth_client, site):
        """Deleting a site from another org should return 404."""
        resp = other_auth_client.delete(self.detail_url(site.pk))
        assert resp.status_code == 404
        assert Site.objects.filter(pk=site.pk).exists()

    # -- Greenhouse count ---

    def test_greenhouse_count(self, auth_client, user, site):
        """The greenhouse_count field should be accurate."""
        GreenhouseFactory(owner=user, site=site)
        GreenhouseFactory(owner=user, site=site)
        resp = auth_client.get(self.detail_url(site.pk))
        assert resp.status_code == 200
        assert resp.data["greenhouse_count"] == 2


# ===========================================================================
# Site Weather Endpoint Tests
# ===========================================================================


@pytest.mark.django_db
class TestSiteWeather:
    """Test /api/sites/{id}/weather/ endpoint."""

    def weather_url(self, pk: int) -> str:
        return f"/api/sites/{pk}/weather/"

    def test_weather_requires_auth(self, api_client, site):
        """Unauthenticated requests should be rejected."""
        assert api_client.get(self.weather_url(site.pk)).status_code == 401

    def test_weather_returns_current_and_forecast(self, auth_client, site):
        """Should return current weather and forecast arrays."""
        now = django_tz.now()
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now)
        WeatherDataFactory(
            site=site, is_forecast=True, timestamp=now + timedelta(hours=1),
        )
        WeatherDataFactory(
            site=site, is_forecast=True, timestamp=now + timedelta(hours=2),
        )

        resp = auth_client.get(self.weather_url(site.pk))
        assert resp.status_code == 200
        assert resp.data["site_id"] == site.pk
        assert resp.data["site_name"] == site.name
        assert resp.data["current"] is not None
        assert resp.data["current"]["is_forecast"] is False
        assert len(resp.data["forecast"]) == 2

    def test_weather_no_data(self, auth_client, site):
        """Should return null current and empty forecast when no data exists."""
        resp = auth_client.get(self.weather_url(site.pk))
        assert resp.status_code == 200
        assert resp.data["current"] is None
        assert resp.data["forecast"] == []

    def test_weather_other_org_denied(self, other_auth_client, site):
        """Should return 404 for sites in another org."""
        resp = other_auth_client.get(self.weather_url(site.pk))
        assert resp.status_code == 404


# ===========================================================================
# Site Weather History Tests
# ===========================================================================


@pytest.mark.django_db
class TestSiteWeatherHistory:
    """Test /api/sites/{id}/weather/history/ endpoint."""

    def history_url(self, pk: int) -> str:
        return f"/api/sites/{pk}/weather/history/"

    def test_weather_history_requires_auth(self, api_client, site):
        assert api_client.get(self.history_url(site.pk)).status_code == 401

    def test_weather_history_default_7_days(self, auth_client, site):
        """Should return data for the last 7 days by default."""
        now = django_tz.now()
        # Within 7 days
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(days=3))
        # Outside 7 days
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(days=10))

        resp = auth_client.get(self.history_url(site.pk))
        assert resp.status_code == 200
        assert resp.data["period_days"] == 7
        assert len(resp.data["data"]) == 1

    def test_weather_history_custom_days(self, auth_client, site):
        """Specifying days parameter should adjust the period."""
        now = django_tz.now()
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(days=10))

        resp = auth_client.get(self.history_url(site.pk) + "?days=14")
        assert resp.status_code == 200
        assert resp.data["period_days"] == 14
        assert len(resp.data["data"]) == 1

    def test_weather_history_max_30_days(self, auth_client, site):
        """Days parameter should be capped at 30."""
        resp = auth_client.get(self.history_url(site.pk) + "?days=60")
        assert resp.status_code == 200
        assert resp.data["period_days"] == 30

    def test_weather_history_excludes_forecast(self, auth_client, site):
        """History should only include actual weather, not forecasts."""
        now = django_tz.now()
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(hours=5))
        WeatherDataFactory(site=site, is_forecast=True, timestamp=now - timedelta(hours=3))

        resp = auth_client.get(self.history_url(site.pk))
        assert resp.status_code == 200
        assert len(resp.data["data"]) == 1

    def test_weather_history_other_org_denied(self, other_auth_client, site):
        resp = other_auth_client.get(self.history_url(site.pk))
        assert resp.status_code == 404


# ===========================================================================
# Site Dashboard Tests
# ===========================================================================


@pytest.mark.django_db
class TestSiteDashboard:
    """Test /api/sites/dashboard/ endpoint."""

    dashboard_url = "/api/sites/dashboard/"

    def test_dashboard_requires_auth(self, api_client):
        assert api_client.get(self.dashboard_url).status_code == 401

    def test_dashboard_empty(self, auth_client):
        """Should return empty list when no sites exist."""
        resp = auth_client.get(self.dashboard_url)
        assert resp.status_code == 200
        assert resp.data == []

    def test_dashboard_returns_site_summary(self, auth_client, user, site):
        """Should return summary info for each site."""
        gh = GreenhouseFactory(owner=user, site=site)
        ZoneFactory(greenhouse=gh)

        resp = auth_client.get(self.dashboard_url)
        assert resp.status_code == 200
        assert len(resp.data) == 1

        entry = resp.data[0]
        assert entry["site_id"] == site.pk
        assert entry["site_name"] == site.name
        assert entry["greenhouse_count"] == 1
        assert entry["zone_count"] == 1
        assert "latitude" in entry
        assert "longitude" in entry
        assert "active_alerts" in entry
        assert "weather_alerts" in entry

    def test_dashboard_excludes_inactive_sites(self, auth_client, user):
        """Inactive sites should not appear in the dashboard."""
        org = Membership.objects.filter(user=user).first().organization
        SiteFactory(organization=org, is_active=False)

        resp = auth_client.get(self.dashboard_url)
        assert resp.status_code == 200
        assert len(resp.data) == 0

    def test_dashboard_includes_weather_data(self, auth_client, site):
        """When current weather exists, it should be included."""
        WeatherDataFactory(site=site, is_forecast=False)

        resp = auth_client.get(self.dashboard_url)
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]["current_weather"] is not None

    def test_dashboard_org_isolation(self, auth_client, other_user):
        """Dashboard should not include sites from other organizations."""
        other_org = Membership.objects.filter(user=other_user).first().organization
        SiteFactory(organization=other_org)

        resp = auth_client.get(self.dashboard_url)
        assert resp.status_code == 200
        assert len(resp.data) == 0

    def test_dashboard_weather_alert_count(self, auth_client, site):
        """Weather alert count should reflect unacknowledged alerts."""
        WeatherAlertFactory(site=site, is_acknowledged=False)
        WeatherAlertFactory(site=site, is_acknowledged=True)

        resp = auth_client.get(self.dashboard_url)
        assert resp.status_code == 200
        assert resp.data[0]["weather_alerts"] == 1


# ===========================================================================
# Weather Alert Tests
# ===========================================================================


@pytest.mark.django_db
class TestWeatherAlerts:
    """Test weather alert listing and acknowledgement."""

    list_url = "/api/weather-alerts/"

    def ack_url(self, pk: int) -> str:
        return f"/api/weather-alerts/{pk}/acknowledge/"

    def test_list_requires_auth(self, api_client):
        assert api_client.get(self.list_url).status_code == 401

    def test_list_returns_own_alerts(self, auth_client, site):
        """Should return weather alerts for the user's sites."""
        alert = WeatherAlertFactory(site=site)
        resp = auth_client.get(self.list_url)
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["id"] == alert.pk

    def test_list_org_isolation(self, auth_client, other_user):
        """Should not include alerts from other organizations."""
        other_org = Membership.objects.filter(user=other_user).first().organization
        other_site = SiteFactory(organization=other_org)
        WeatherAlertFactory(site=other_site)

        resp = auth_client.get(self.list_url)
        assert resp.status_code == 200
        assert resp.data["count"] == 0

    def test_list_filter_by_site(self, auth_client, user):
        """Should filter alerts by site_id."""
        org = Membership.objects.filter(user=user).first().organization
        site_a = SiteFactory(organization=org, name="Site A")
        site_b = SiteFactory(organization=org, name="Site B")
        WeatherAlertFactory(site=site_a)
        WeatherAlertFactory(site=site_b)

        resp = auth_client.get(f"{self.list_url}?site={site_a.pk}")
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["site"] == site_a.pk

    def test_list_filter_by_acknowledged(self, auth_client, site):
        """Should filter by acknowledged status."""
        WeatherAlertFactory(site=site, is_acknowledged=False)
        WeatherAlertFactory(site=site, is_acknowledged=True)

        resp = auth_client.get(f"{self.list_url}?acknowledged=false")
        assert resp.status_code == 200
        assert resp.data["count"] == 1

        resp = auth_client.get(f"{self.list_url}?acknowledged=true")
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_acknowledge_alert(self, auth_client, user, site):
        """Acknowledging an alert should set the flags and user."""
        alert = WeatherAlertFactory(site=site)
        resp = auth_client.patch(self.ack_url(alert.pk))
        assert resp.status_code == 200
        assert resp.data["is_acknowledged"] is True
        assert resp.data["acknowledged_by"] == user.pk
        assert resp.data["acknowledged_at"] is not None

        alert.refresh_from_db()
        assert alert.is_acknowledged is True
        assert alert.acknowledged_by == user

    def test_acknowledge_other_org_denied(self, other_auth_client, site):
        """Acknowledging alerts from another org should fail."""
        alert = WeatherAlertFactory(site=site)
        resp = other_auth_client.patch(self.ack_url(alert.pk))
        assert resp.status_code == 404

    def test_alert_serializer_includes_site_name(self, auth_client, site):
        """The serializer should include the site_name field."""
        WeatherAlertFactory(site=site)
        resp = auth_client.get(self.list_url)
        assert resp.status_code == 200
        assert resp.data["results"][0]["site_name"] == site.name


# ===========================================================================
# Weather Correlation Tests
# ===========================================================================


@pytest.mark.django_db
class TestWeatherCorrelation:
    """Test /api/zones/{id}/weather-correlation/ endpoint."""

    def corr_url(self, zone_pk: int) -> str:
        return f"/api/zones/{zone_pk}/weather-correlation/"

    def test_requires_auth(self, api_client, zone):
        assert api_client.get(self.corr_url(zone.pk)).status_code == 401

    def test_no_site_linked(self, auth_client, zone):
        """When the greenhouse has no site, return an informative response."""
        zone.greenhouse.site = None
        zone.greenhouse.save()

        resp = auth_client.get(self.corr_url(zone.pk))
        assert resp.status_code == 200
        assert resp.data["data"] == []
        assert "No site associated" in resp.data.get("message", "")

    def test_returns_correlated_data(self, auth_client, user, site):
        """Should return weather and sensor data aligned by hour."""
        gh = GreenhouseFactory(owner=user, site=site)
        z = ZoneFactory(greenhouse=gh)
        s = SensorFactory(zone=z, sensor_type=Sensor.SensorType.TEMPERATURE, unit="C")

        now = django_tz.now().replace(minute=0, second=0, microsecond=0)

        # Create weather data for the site
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(hours=2))
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(hours=1))

        # Create hourly sensor readings
        SensorReadingHourly.objects.create(
            sensor=s,
            hour=now - timedelta(hours=2),
            avg_value=23.5,
            min_value=22.0,
            max_value=25.0,
            count=12,
        )

        resp = auth_client.get(self.corr_url(z.pk))
        assert resp.status_code == 200
        assert resp.data["zone_id"] == z.pk
        assert resp.data["site_name"] == site.name
        assert len(resp.data["data"]) == 2

        # At least one entry should have sensor readings
        entries_with_readings = [
            d for d in resp.data["data"] if d.get("sensor_readings")
        ]
        assert len(entries_with_readings) >= 1

    def test_custom_days_parameter(self, auth_client, user, site):
        """The days parameter should limit the period."""
        gh = GreenhouseFactory(owner=user, site=site)
        z = ZoneFactory(greenhouse=gh)

        now = django_tz.now()
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(days=5))
        WeatherDataFactory(site=site, is_forecast=False, timestamp=now - timedelta(days=15))

        resp = auth_client.get(f"{self.corr_url(z.pk)}?days=7")
        assert resp.status_code == 200
        assert resp.data["period_days"] == 7
        assert len(resp.data["data"]) == 1

    def test_org_isolation(self, other_auth_client, zone):
        """Should not allow access to zones from another org."""
        resp = other_auth_client.get(self.corr_url(zone.pk))
        assert resp.status_code == 404


# ===========================================================================
# Weather Service Unit Tests
# ===========================================================================


class TestParseCurrentWeather:
    """Test weather_service.parse_current_weather()."""

    def test_parse_valid_response(self):
        """Should correctly extract all current weather fields."""
        result = parse_current_weather(MOCK_OPEN_METEO_RESPONSE)
        assert result is not None
        assert result["timestamp"] == "2025-07-15T14:00"
        assert result["temperature"] == 28.3
        assert result["humidity"] == 55
        assert result["precipitation"] == 0.0
        assert result["wind_speed"] == 8.5
        assert result["uv_index"] == 6.2
        assert result["cloud_cover"] == 30
        assert result["weather_code"] == 2
        assert result["is_forecast"] is False

    def test_parse_missing_current_key(self):
        """Should return None when 'current' key is absent."""
        result = parse_current_weather({"hourly": {}})
        assert result is None

    def test_parse_empty_current(self):
        """Should return None when 'current' is empty/falsy."""
        result = parse_current_weather({"current": {}})
        assert result is None

    def test_parse_partial_data(self):
        """Should gracefully handle missing fields (return None for them)."""
        data = {
            "current": {
                "time": "2025-07-15T14:00",
                "temperature_2m": 25.0,
            }
        }
        result = parse_current_weather(data)
        assert result is not None
        assert result["temperature"] == 25.0
        assert result["humidity"] is None
        assert result["precipitation"] is None


class TestParseHourlyForecast:
    """Test weather_service.parse_hourly_forecast()."""

    def test_parse_valid_hourly(self):
        """Should extract all hourly entries from the response."""
        result = parse_hourly_forecast(MOCK_OPEN_METEO_RESPONSE)
        assert len(result) == 3
        assert result[0]["timestamp"] == "2025-07-15T00:00"
        assert result[0]["temperature"] == 22.0
        assert result[0]["humidity"] == 70
        assert result[0]["is_forecast"] is True

        assert result[2]["temperature"] == 21.0
        assert result[2]["precipitation"] == 0.2

    def test_parse_missing_hourly_key(self):
        """Should return empty list when 'hourly' key is absent."""
        result = parse_hourly_forecast({"current": {}})
        assert result == []

    def test_parse_empty_hourly(self):
        """Should return empty list when 'hourly' is empty."""
        result = parse_hourly_forecast({"hourly": {}})
        assert result == []

    def test_parse_mismatched_arrays(self):
        """Should handle arrays of different lengths gracefully."""
        data = {
            "hourly": {
                "time": ["2025-07-15T00:00", "2025-07-15T01:00"],
                "temperature_2m": [20.0],  # shorter
                "relative_humidity_2m": [60, 65],
            }
        }
        result = parse_hourly_forecast(data)
        assert len(result) == 2
        assert result[0]["temperature"] == 20.0
        assert result[1]["temperature"] is None  # out of bounds
        assert result[1]["humidity"] == 65


class TestAnalyzeForecastForAlerts:
    """Test weather_service.analyze_forecast_for_alerts()."""

    def test_heatwave_detected(self):
        """Temperatures above 35C should trigger a CRITICAL heatwave alert."""
        hourly = [
            {"timestamp": "2025-08-01T12:00", "temperature": 36.5,
             "precipitation": 0, "uv_index": 5},
            {"timestamp": "2025-08-01T13:00", "temperature": 37.0,
             "precipitation": 0, "uv_index": 6},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Test Farm")
        heatwave = [a for a in alerts if "Heatwave" in a["title"]]
        assert len(heatwave) == 1
        assert heatwave[0]["alert_level"] == "CRITICAL"
        assert heatwave[0]["forecast_date"] == "2025-08-01"
        assert "36.5" in heatwave[0]["message"]

    def test_frost_detected(self):
        """Temperatures below 0C should trigger a CRITICAL frost alert."""
        hourly = [
            {"timestamp": "2025-01-15T04:00", "temperature": -2.3,
             "precipitation": 0, "uv_index": 0},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Cold Farm")
        frost = [a for a in alerts if "Frost" in a["title"]]
        assert len(frost) == 1
        assert frost[0]["alert_level"] == "CRITICAL"
        assert "-2.3" in frost[0]["message"]

    def test_heavy_rain_detected(self):
        """Precipitation above 10mm/h should trigger a WARNING alert."""
        hourly = [
            {"timestamp": "2025-06-01T15:00", "temperature": 20,
             "precipitation": 15.2, "uv_index": 1},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Rainy Farm")
        rain = [a for a in alerts if "Heavy rain" in a["title"]]
        assert len(rain) == 1
        assert rain[0]["alert_level"] == "WARNING"
        assert "15.2" in rain[0]["message"]

    def test_high_uv_detected(self):
        """UV index above 8 should trigger a WARNING alert."""
        hourly = [
            {"timestamp": "2025-07-20T12:00", "temperature": 30,
             "precipitation": 0, "uv_index": 9.5},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "UV Farm")
        uv_alerts = [a for a in alerts if "UV" in a["title"]]
        assert len(uv_alerts) == 1
        assert uv_alerts[0]["alert_level"] == "WARNING"
        assert "9.5" in uv_alerts[0]["message"]

    def test_dedup_per_date(self):
        """Multiple hours on the same date should only generate one alert per type."""
        hourly = [
            {"timestamp": "2025-08-01T12:00", "temperature": 36.0,
             "precipitation": 0, "uv_index": 5},
            {"timestamp": "2025-08-01T14:00", "temperature": 38.0,
             "precipitation": 0, "uv_index": 5},
            {"timestamp": "2025-08-01T16:00", "temperature": 37.5,
             "precipitation": 0, "uv_index": 5},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Hot Farm")
        heatwave = [a for a in alerts if "Heatwave" in a["title"]]
        assert len(heatwave) == 1  # Only one per date

    def test_multiple_alert_types_same_day(self):
        """Multiple alert types on the same day should each generate an alert."""
        hourly = [
            {"timestamp": "2025-07-20T10:00", "temperature": 36.0,
             "precipitation": 12.0, "uv_index": 9.0},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Multi Farm")
        assert len(alerts) == 3  # heatwave + heavy rain + high UV

    def test_no_alerts_for_normal_conditions(self):
        """Normal weather should not trigger any alerts."""
        hourly = [
            {"timestamp": "2025-06-15T10:00", "temperature": 22.0,
             "precipitation": 2.0, "uv_index": 4.0},
            {"timestamp": "2025-06-15T11:00", "temperature": 24.0,
             "precipitation": 0.0, "uv_index": 5.0},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Normal Farm")
        assert len(alerts) == 0

    def test_empty_hourly_data(self):
        """Empty data should return no alerts."""
        alerts = analyze_forecast_for_alerts([], "Empty Farm")
        assert alerts == []

    def test_invalid_timestamps_skipped(self):
        """Entries with invalid timestamps should be skipped."""
        hourly = [
            {"timestamp": "not-a-date", "temperature": 40.0,
             "precipitation": 0, "uv_index": 0},
            {"timestamp": None, "temperature": -5.0,
             "precipitation": 0, "uv_index": 0},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Bad Data Farm")
        assert alerts == []

    def test_none_values_ignored(self):
        """None values for measurements should not trigger alerts."""
        hourly = [
            {"timestamp": "2025-07-20T10:00", "temperature": None,
             "precipitation": None, "uv_index": None},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Null Farm")
        assert alerts == []

    def test_alerts_across_multiple_dates(self):
        """Alerts on different dates should each be generated."""
        hourly = [
            {"timestamp": "2025-08-01T12:00", "temperature": 36.0,
             "precipitation": 0, "uv_index": 3},
            {"timestamp": "2025-08-02T12:00", "temperature": 37.0,
             "precipitation": 0, "uv_index": 3},
        ]
        alerts = analyze_forecast_for_alerts(hourly, "Multi-Day Farm")
        heatwave = [a for a in alerts if "Heatwave" in a["title"]]
        assert len(heatwave) == 2
        dates = {a["forecast_date"] for a in heatwave}
        assert dates == {"2025-08-01", "2025-08-02"}


class TestWeatherCodeDescription:
    """Test weather_service.weather_code_description()."""

    def test_known_codes(self):
        assert weather_code_description(0) == "Clear sky"
        assert weather_code_description(3) == "Overcast"
        assert weather_code_description(65) == "Heavy rain"
        assert weather_code_description(95) == "Thunderstorm"

    def test_unknown_code(self):
        result = weather_code_description(999)
        assert result == "Code 999"

    def test_none_code(self):
        assert weather_code_description(None) == "Unknown"


# ===========================================================================
# WeatherData Model Tests
# ===========================================================================


@pytest.mark.django_db
class TestWeatherDataModel:
    """Test WeatherData model creation and queries."""

    def test_create_weather_data(self, site):
        """Should create a WeatherData record with all fields."""
        now = django_tz.now()
        wd = WeatherData.objects.create(
            site=site,
            timestamp=now,
            temperature=25.0,
            humidity=60.0,
            precipitation=0.5,
            wind_speed=10.0,
            uv_index=4.0,
            cloud_cover=50.0,
            weather_code=2,
            is_forecast=False,
        )
        assert wd.pk is not None
        assert wd.site == site
        assert wd.temperature == 25.0
        assert wd.is_forecast is False

    def test_weather_data_str(self, site):
        """The __str__ method should contain site name and kind."""
        wd = WeatherDataFactory(site=site, is_forecast=False)
        s = str(wd)
        assert site.name in s
        assert "current" in s

        wd_forecast = WeatherDataFactory(site=site, is_forecast=True)
        s2 = str(wd_forecast)
        assert "forecast" in s2

    def test_nullable_fields(self, site):
        """All measurement fields should be nullable."""
        wd = WeatherData.objects.create(
            site=site,
            timestamp=django_tz.now(),
        )
        assert wd.temperature is None
        assert wd.humidity is None
        assert wd.precipitation is None
        assert wd.wind_speed is None
        assert wd.uv_index is None
        assert wd.cloud_cover is None
        assert wd.weather_code is None

    def test_ordering(self, site):
        """Records should be ordered by -timestamp by default."""
        now = django_tz.now()
        wd1 = WeatherDataFactory(site=site, timestamp=now - timedelta(hours=2))
        wd2 = WeatherDataFactory(site=site, timestamp=now - timedelta(hours=1))
        wd3 = WeatherDataFactory(site=site, timestamp=now)

        records = list(WeatherData.objects.filter(site=site))
        assert records[0].pk == wd3.pk
        assert records[2].pk == wd1.pk


# ===========================================================================
# WeatherAlert Model Tests
# ===========================================================================


@pytest.mark.django_db
class TestWeatherAlertModel:
    """Test WeatherAlert model."""

    def test_create_alert(self, site):
        """Should create a WeatherAlert with all fields."""
        alert = WeatherAlert.objects.create(
            site=site,
            alert_level=WeatherAlert.AlertLevel.CRITICAL,
            title="Heatwave warning",
            message="Temperature above 35C expected.",
            forecast_date=date.today(),
        )
        assert alert.pk is not None
        assert alert.is_acknowledged is False
        assert alert.acknowledged_by is None

    def test_alert_str(self, site):
        """The __str__ method should include severity and title."""
        alert = WeatherAlertFactory(
            site=site,
            alert_level=WeatherAlert.AlertLevel.CRITICAL,
            title="Frost warning",
        )
        s = str(alert)
        assert "CRITICAL" in s
        assert "Frost warning" in s
        assert site.name in s

    def test_alert_level_choices(self):
        """All expected alert levels should exist."""
        levels = {c[0] for c in WeatherAlert.AlertLevel.choices}
        assert "INFO" in levels
        assert "WARNING" in levels
        assert "CRITICAL" in levels


# ===========================================================================
# Site Model Tests
# ===========================================================================


@pytest.mark.django_db
class TestSiteModel:
    """Test the Site model."""

    def test_create_site(self, user):
        """Should create a Site with valid data."""
        org = Membership.objects.filter(user=user).first().organization
        site = Site.objects.create(
            organization=org,
            name="Test Site",
            address="123 Test St",
            latitude=48.8566,
            longitude=2.3522,
            timezone="Europe/Paris",
        )
        assert site.pk is not None
        assert site.is_active is True

    def test_site_str(self, site):
        """The __str__ method should include name and coordinates."""
        s = str(site)
        assert site.name in s
        assert str(round(site.latitude, 4)) in s

    def test_site_ordering(self, user):
        """Sites should be ordered by name."""
        org = Membership.objects.filter(user=user).first().organization
        s2 = SiteFactory(organization=org, name="Zulu Farm")
        s1 = SiteFactory(organization=org, name="Alpha Farm")
        sites = list(Site.objects.filter(organization=org))
        assert sites[0].name == "Alpha Farm"
        assert sites[1].name == "Zulu Farm"

    def test_cascade_delete_org(self, user):
        """Deleting the organization should cascade to sites."""
        org = Membership.objects.filter(user=user).first().organization
        site = SiteFactory(organization=org)
        site_pk = site.pk
        org.delete()
        assert not Site.objects.filter(pk=site_pk).exists()


# ===========================================================================
# Integration: fetch_weather with mock
# ===========================================================================


@pytest.mark.django_db
class TestFetchWeatherIntegration:
    """Test the fetch_weather function with mocked HTTP calls."""

    @patch("apps.iot.weather_service.requests.get")
    def test_fetch_weather_success(self, mock_get, site):
        """Should return parsed JSON on success."""
        from apps.iot.weather_service import fetch_weather

        mock_response = mock_get.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = MOCK_OPEN_METEO_RESPONSE
        mock_response.raise_for_status.return_value = None

        result = fetch_weather(site.latitude, site.longitude, site.timezone)
        assert result is not None
        assert "current" in result
        assert "hourly" in result
        mock_get.assert_called_once()

    @patch("apps.iot.weather_service.requests.get")
    def test_fetch_weather_network_error(self, mock_get, site):
        """Should return None on network error."""
        import requests as req
        from apps.iot.weather_service import fetch_weather

        mock_get.side_effect = req.ConnectionError("Network unreachable")

        result = fetch_weather(site.latitude, site.longitude, site.timezone)
        assert result is None

    @patch("apps.iot.weather_service.requests.get")
    def test_fetch_weather_api_error(self, mock_get, site):
        """Should return None on non-200 response."""
        import requests as req
        from apps.iot.weather_service import fetch_weather

        mock_response = mock_get.return_value
        mock_response.raise_for_status.side_effect = req.HTTPError("500 Server Error")

        result = fetch_weather(site.latitude, site.longitude, site.timezone)
        assert result is None

    @patch("apps.iot.weather_service.requests.get")
    def test_fetch_weather_timeout(self, mock_get, site):
        """Should return None on request timeout."""
        import requests as req
        from apps.iot.weather_service import fetch_weather

        mock_get.side_effect = req.Timeout("Timeout")

        result = fetch_weather(site.latitude, site.longitude, site.timezone)
        assert result is None
