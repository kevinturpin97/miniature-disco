"""Django management command to simulate sensor data for demo without hardware.

Generates realistic sensor readings with gradual variation and occasional
anomalies to demonstrate alerts and automation triggers.

Usage::

    python manage.py simulate_data                     # Run continuously
    python manage.py simulate_data --count 100         # Generate 100 readings then stop
    python manage.py simulate_data --interval 5        # 5s between readings
    python manage.py simulate_data --backfill 24       # Backfill last 24 hours
"""

import logging
import math
import random
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.iot.models import Sensor, SensorReading, Zone

logger = logging.getLogger(__name__)

# Baseline values and ranges for each sensor type
SENSOR_PROFILES: dict[str, dict] = {
    "TEMP": {"base": 24.0, "amplitude": 4.0, "noise": 1.0, "anomaly_delta": 8.0},
    "HUM_AIR": {"base": 65.0, "amplitude": 10.0, "noise": 3.0, "anomaly_delta": 20.0},
    "HUM_SOIL": {"base": 55.0, "amplitude": 8.0, "noise": 2.0, "anomaly_delta": 15.0},
    "PH": {"base": 6.5, "amplitude": 0.3, "noise": 0.1, "anomaly_delta": 1.0},
    "LIGHT": {"base": 8000.0, "amplitude": 6000.0, "noise": 500.0, "anomaly_delta": 5000.0},
    "CO2": {"base": 600.0, "amplitude": 200.0, "noise": 50.0, "anomaly_delta": 400.0},
}


def generate_value(sensor_type: str, t: float, anomaly: bool = False) -> float:
    """Generate a realistic sensor value based on time and sensor type.

    Args:
        sensor_type: The sensor type key (TEMP, HUM_AIR, etc.).
        t: Time parameter in hours (for diurnal cycle simulation).
        anomaly: If True, add an anomaly spike.

    Returns:
        Simulated sensor value.
    """
    profile = SENSOR_PROFILES.get(sensor_type, {"base": 50.0, "amplitude": 5.0, "noise": 1.0, "anomaly_delta": 10.0})

    # Diurnal cycle (sine wave with 24h period)
    diurnal = math.sin(2 * math.pi * t / 24.0) * profile["amplitude"]
    noise = random.gauss(0, profile["noise"])
    value = profile["base"] + diurnal + noise

    if anomaly:
        direction = random.choice([-1, 1])
        value += direction * profile["anomaly_delta"]

    # Clamp to sane ranges
    if sensor_type in ("HUM_AIR", "HUM_SOIL"):
        value = max(0.0, min(100.0, value))
    elif sensor_type == "PH":
        value = max(3.0, min(10.0, value))
    elif sensor_type == "LIGHT":
        value = max(0.0, value)
    elif sensor_type == "CO2":
        value = max(200.0, value)

    return round(value, 2)


class Command(BaseCommand):
    """Simulate realistic sensor readings for demo without hardware."""

    help = "Simulate sensor data for demo (generates SensorReading entries)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=0,
            help="Number of reading cycles to generate (0 = run forever)",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=10,
            help="Seconds between reading cycles (default: 10)",
        )
        parser.add_argument(
            "--anomaly-rate",
            type=float,
            default=0.05,
            help="Probability of generating an anomaly reading (default: 0.05)",
        )
        parser.add_argument(
            "--backfill",
            type=int,
            default=0,
            help="Backfill N hours of historical data (default: 0, disabled)",
        )

    def handle(self, *args, **options):
        count = options["count"]
        interval = options["interval"]
        anomaly_rate = options["anomaly_rate"]
        backfill = options["backfill"]

        sensors = list(
            Sensor.objects.filter(is_active=True)
            .select_related("zone")
        )

        if not sensors:
            self.stdout.write(self.style.ERROR("No active sensors found. Run 'seed_data' first."))
            return

        self.stdout.write(self.style.SUCCESS(
            f"Simulating data for {len(sensors)} sensors across "
            f"{Zone.objects.filter(is_active=True).count()} zones"
        ))

        if backfill > 0:
            self._backfill(sensors, backfill, anomaly_rate)

        if count == 0 and backfill > 0 and not self._should_run_live():
            return

        self._run_live(sensors, count, interval, anomaly_rate)

    def _should_run_live(self) -> bool:
        """Check if we should continue with live simulation after backfill."""
        return True

    def _backfill(self, sensors: list[Sensor], hours: int, anomaly_rate: float) -> None:
        """Generate historical readings for the past N hours."""
        self.stdout.write(f"Backfilling {hours} hours of data...")
        now = timezone.now()
        readings_to_create: list[SensorReading] = []
        total = 0

        # Generate readings every 5 minutes for the backfill period
        for minutes_ago in range(hours * 60, 0, -5):
            timestamp = now - timedelta(minutes=minutes_ago)
            t_hours = (timestamp.hour + timestamp.minute / 60.0)
            anomaly = random.random() < anomaly_rate

            for sensor in sensors:
                value = generate_value(sensor.sensor_type, t_hours, anomaly and random.random() < 0.3)
                readings_to_create.append(SensorReading(
                    sensor=sensor,
                    value=value,
                    received_at=timestamp,
                ))
                total += 1

            # Batch insert every 1000 readings
            if len(readings_to_create) >= 1000:
                SensorReading.objects.bulk_create(readings_to_create)
                readings_to_create = []

        if readings_to_create:
            SensorReading.objects.bulk_create(readings_to_create)

        # Update last_seen on zones
        for sensor in sensors:
            sensor.zone.last_seen = now
            sensor.zone.save(update_fields=["last_seen"])

        self.stdout.write(self.style.SUCCESS(f"  Created {total} historical readings."))

    def _run_live(self, sensors: list[Sensor], count: int, interval: int, anomaly_rate: float) -> None:
        """Generate live readings in real-time."""
        self.stdout.write(f"Starting live simulation (interval={interval}s, count={'∞' if count == 0 else count})...")
        self.stdout.write("Press Ctrl+C to stop.\n")

        cycle = 0
        try:
            while count == 0 or cycle < count:
                now = timezone.now()
                t_hours = (now.hour + now.minute / 60.0)
                anomaly = random.random() < anomaly_rate

                for sensor in sensors:
                    is_anomaly = anomaly and random.random() < 0.3
                    value = generate_value(sensor.sensor_type, t_hours, is_anomaly)

                    # Use regular create to trigger post_save signals
                    # (threshold evaluation, automation rules, WebSocket push)
                    SensorReading.objects.create(
                        sensor=sensor,
                        value=value,
                    )

                    if is_anomaly:
                        self.stdout.write(
                            self.style.WARNING(f"  ⚠ ANOMALY {sensor.zone.name}/{sensor.sensor_type}: {value}")
                        )

                # Update last_seen on all active zones
                zone_ids = {s.zone_id for s in sensors}
                Zone.objects.filter(pk__in=zone_ids).update(last_seen=now)

                cycle += 1
                if cycle % 10 == 0 or count > 0:
                    self.stdout.write(
                        f"  Cycle {cycle}: generated {len(sensors)} readings "
                        f"@ {now.strftime('%H:%M:%S')}"
                    )

                if count == 0 or cycle < count:
                    time.sleep(interval)

        except KeyboardInterrupt:
            self.stdout.write(self.style.SUCCESS(f"\nStopped after {cycle} cycles."))
