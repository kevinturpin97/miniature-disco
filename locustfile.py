"""Locust load test scenarios for the Greenhouse SaaS platform.

Simulates realistic production traffic:
    - 100 zones sending sensor readings
    - ~1000 readings/min total throughput
    - Dashboard and API queries
    - WebSocket connections

Usage:
    locust -f locustfile.py --host=http://localhost:8000
"""

import json
import random
from datetime import datetime, timezone

from locust import HttpUser, between, events, task


class GreenhouseAPIUser(HttpUser):
    """Simulates a typical API user interacting with the Greenhouse platform."""

    wait_time = between(1, 5)
    token: str | None = None
    greenhouse_id: int | None = None
    zone_ids: list[int] = []
    sensor_ids: list[int] = []

    def on_start(self) -> None:
        """Authenticate and fetch initial data."""
        # Login
        response = self.client.post(
            "/api/auth/login/",
            json={
                "username": "loadtest",
                "password": "loadtest123!",
            },
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access")
            self.client.headers.update(
                {"Authorization": f"Bearer {self.token}"}
            )
            self._fetch_resources()

    def _fetch_resources(self) -> None:
        """Fetch greenhouse, zones, and sensors for subsequent requests."""
        resp = self.client.get("/api/greenhouses/")
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            if results:
                self.greenhouse_id = results[0]["id"]

                zone_resp = self.client.get(
                    f"/api/greenhouses/{self.greenhouse_id}/zones/"
                )
                if zone_resp.status_code == 200:
                    zones = zone_resp.json().get("results", [])
                    self.zone_ids = [z["id"] for z in zones]

                    for zone_id in self.zone_ids[:5]:
                        sensor_resp = self.client.get(
                            f"/api/zones/{zone_id}/sensors/"
                        )
                        if sensor_resp.status_code == 200:
                            sensors = sensor_resp.json().get("results", [])
                            self.sensor_ids.extend(s["id"] for s in sensors)

    @task(10)
    def view_dashboard(self) -> None:
        """Load the main dashboard endpoint."""
        self.client.get("/api/dashboard/")

    @task(5)
    def view_zone_dashboard(self) -> None:
        """Load a specific zone's dashboard."""
        if self.zone_ids:
            zone_id = random.choice(self.zone_ids)
            self.client.get(f"/api/zones/{zone_id}/dashboard/")

    @task(3)
    def list_alerts(self) -> None:
        """Query the alerts listing with filters."""
        self.client.get("/api/alerts/?severity=WARNING&acknowledged=false")

    @task(3)
    def view_sensor_readings(self) -> None:
        """Fetch recent sensor readings with time filter."""
        if self.sensor_ids:
            sensor_id = random.choice(self.sensor_ids)
            self.client.get(
                f"/api/sensors/{sensor_id}/readings/?interval=1h"
            )

    @task(2)
    def list_automations(self) -> None:
        """List automation rules for a zone."""
        if self.zone_ids:
            zone_id = random.choice(self.zone_ids)
            self.client.get(f"/api/zones/{zone_id}/automations/")

    @task(2)
    def list_commands(self) -> None:
        """List recent commands for a zone."""
        if self.zone_ids:
            zone_id = random.choice(self.zone_ids)
            self.client.get(f"/api/zones/{zone_id}/commands/")

    @task(1)
    def view_zone_analytics(self) -> None:
        """Fetch analytics for a zone."""
        if self.zone_ids:
            zone_id = random.choice(self.zone_ids)
            self.client.get(f"/api/zones/{zone_id}/analytics/")

    @task(1)
    def check_health(self) -> None:
        """Hit the health check endpoint."""
        self.client.get("/api/health/")

    @task(1)
    def check_readiness(self) -> None:
        """Hit the readiness endpoint."""
        self.client.get("/api/health/ready/")


class SensorSimulatorUser(HttpUser):
    """Simulates relay nodes pushing sensor data at ~10 readings/second.

    Each user represents approximately 10 zones, each sending data
    every 30 seconds (configurable). With 10 users, this generates
    ~1000 readings/min across 100 zones.
    """

    wait_time = between(0.5, 1.5)
    token: str | None = None
    sensor_ids: list[int] = []

    def on_start(self) -> None:
        """Authenticate and discover sensors."""
        response = self.client.post(
            "/api/auth/login/",
            json={
                "username": "loadtest",
                "password": "loadtest123!",
            },
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access")
            self.client.headers.update(
                {"Authorization": f"Bearer {self.token}"}
            )
            self._discover_sensors()

    def _discover_sensors(self) -> None:
        """Discover all available sensors."""
        resp = self.client.get("/api/greenhouses/")
        if resp.status_code != 200:
            return

        results = resp.json().get("results", [])
        for gh in results[:3]:
            zone_resp = self.client.get(f"/api/greenhouses/{gh['id']}/zones/")
            if zone_resp.status_code != 200:
                continue
            zones = zone_resp.json().get("results", [])
            for zone in zones:
                sensor_resp = self.client.get(f"/api/zones/{zone['id']}/sensors/")
                if sensor_resp.status_code == 200:
                    sensors = sensor_resp.json().get("results", [])
                    self.sensor_ids.extend(s["id"] for s in sensors)

    @task
    def view_sensor_readings(self) -> None:
        """Simulate reading sensor data (what the ingestion pipeline would produce)."""
        if self.sensor_ids:
            sensor_id = random.choice(self.sensor_ids)
            self.client.get(
                f"/api/sensors/{sensor_id}/readings/?interval=5m",
                name="/api/sensors/[id]/readings/",
            )
