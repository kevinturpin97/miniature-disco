"""Django management command to create seed data for demo purposes.

Usage::

    python manage.py seed_data
    python manage.py seed_data --flush   # Delete existing data first
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.iot.models import Actuator, AutomationRule, Greenhouse, Sensor, Zone

User = get_user_model()

SEED_USERNAME = "demo"
SEED_EMAIL = "demo@greenhouse.local"
SEED_PASSWORD = "demo1234"


class Command(BaseCommand):
    """Populate the database with realistic demo data."""

    help = "Create seed data for demo purposes (user, greenhouses, zones, sensors, actuators, rules)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all existing IoT data before seeding",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self.stdout.write("Flushing existing IoT data...")
            AutomationRule.objects.all().delete()
            Actuator.objects.all().delete()
            Sensor.objects.all().delete()
            Zone.objects.all().delete()
            Greenhouse.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Flushed."))

        # Create demo user
        user, created = User.objects.get_or_create(
            username=SEED_USERNAME,
            defaults={"email": SEED_EMAIL, "first_name": "Demo", "last_name": "User"},
        )
        if created:
            user.set_password(SEED_PASSWORD)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"  Created user: {SEED_USERNAME} / {SEED_PASSWORD}"))
        else:
            self.stdout.write(f"  User '{SEED_USERNAME}' already exists — skipping.")

        # Greenhouse 1: Tomato greenhouse
        gh1, _ = Greenhouse.objects.get_or_create(
            owner=user,
            name="Tomato Greenhouse",
            defaults={"location": "Building A — South Wing", "description": "Main production greenhouse for tomatoes."},
        )

        # Greenhouse 2: Herb garden
        gh2, _ = Greenhouse.objects.get_or_create(
            owner=user,
            name="Herb Garden",
            defaults={"location": "Building B — Rooftop", "description": "Indoor herb production."},
        )

        # Zones for greenhouse 1
        z1, _ = Zone.objects.get_or_create(
            greenhouse=gh1,
            name="Seedling Area",
            defaults={"relay_id": 1, "description": "Young tomato plants, controlled humidity.", "transmission_interval": 120},
        )
        z2, _ = Zone.objects.get_or_create(
            greenhouse=gh1,
            name="Main Growing Area",
            defaults={"relay_id": 2, "description": "Mature plants, full cycle.", "transmission_interval": 300},
        )
        z3, _ = Zone.objects.get_or_create(
            greenhouse=gh1,
            name="Harvest Zone",
            defaults={"relay_id": 3, "description": "Ripe tomatoes, low humidity.", "transmission_interval": 300},
        )

        # Zones for greenhouse 2
        z4, _ = Zone.objects.get_or_create(
            greenhouse=gh2,
            name="Basil Section",
            defaults={"relay_id": 4, "description": "Basil and cilantro.", "transmission_interval": 300},
        )
        z5, _ = Zone.objects.get_or_create(
            greenhouse=gh2,
            name="Mint Section",
            defaults={"relay_id": 5, "description": "Mint and thyme.", "transmission_interval": 300},
        )

        # Sensors definitions (zone, type, label, unit, min_threshold, max_threshold)
        sensor_defs = [
            # Zone 1 — Seedling Area
            (z1, "TEMP", "Seedling Temperature", "°C", 18.0, 28.0),
            (z1, "HUM_AIR", "Seedling Air Humidity", "%", 60.0, 85.0),
            (z1, "HUM_SOIL", "Seedling Soil Moisture", "%", 50.0, 80.0),
            (z1, "LIGHT", "Seedling Light", "lux", 2000.0, 10000.0),
            # Zone 2 — Main Growing
            (z2, "TEMP", "Grow Temperature", "°C", 20.0, 32.0),
            (z2, "HUM_AIR", "Grow Air Humidity", "%", 50.0, 75.0),
            (z2, "HUM_SOIL", "Grow Soil Moisture", "%", 40.0, 70.0),
            (z2, "PH", "Grow pH", "", 5.5, 7.0),
            (z2, "CO2", "Grow CO2", "ppm", 300.0, 1200.0),
            (z2, "LIGHT", "Grow Light", "lux", 5000.0, 30000.0),
            # Zone 3 — Harvest
            (z3, "TEMP", "Harvest Temperature", "°C", 18.0, 25.0),
            (z3, "HUM_AIR", "Harvest Air Humidity", "%", 40.0, 60.0),
            # Zone 4 — Basil
            (z4, "TEMP", "Basil Temperature", "°C", 20.0, 30.0),
            (z4, "HUM_AIR", "Basil Air Humidity", "%", 50.0, 70.0),
            (z4, "LIGHT", "Basil Light", "lux", 4000.0, 20000.0),
            # Zone 5 — Mint
            (z5, "TEMP", "Mint Temperature", "°C", 15.0, 25.0),
            (z5, "HUM_SOIL", "Mint Soil Moisture", "%", 50.0, 80.0),
        ]

        for zone, stype, label, unit, min_t, max_t in sensor_defs:
            Sensor.objects.get_or_create(
                zone=zone,
                sensor_type=stype,
                defaults={"label": label, "unit": unit, "min_threshold": min_t, "max_threshold": max_t},
            )

        # Actuators (zone, type, name, gpio_pin)
        actuator_defs = [
            (z1, "FAN", "Seedling Fan", 4),
            (z1, "VALVE", "Seedling Irrigation Valve", 5),
            (z1, "LIGHT", "Seedling Grow Light", 6),
            (z2, "FAN", "Main Ventilation Fan", 4),
            (z2, "VALVE", "Main Irrigation Valve", 5),
            (z2, "HEATER", "Main Zone Heater", 7),
            (z2, "PUMP", "Nutrient Pump", 8),
            (z3, "FAN", "Harvest Zone Fan", 4),
            (z4, "VALVE", "Basil Irrigation Valve", 5),
            (z4, "LIGHT", "Basil Grow Light", 6),
            (z5, "VALVE", "Mint Irrigation Valve", 5),
        ]

        actuator_map: dict[tuple[int, str], Actuator] = {}
        for zone, atype, name, pin in actuator_defs:
            act, _ = Actuator.objects.get_or_create(
                zone=zone,
                name=name,
                defaults={"actuator_type": atype, "gpio_pin": pin},
            )
            actuator_map[(zone.pk, atype)] = act

        # Automation rules
        rule_defs = [
            # If temp > 30 in zone 2, turn on fan
            (z2, "Overheat Protection", "TEMP", "GT", 30.0, (z2.pk, "FAN"), "ON", None, 300),
            # If temp < 20 in zone 2, turn on heater
            (z2, "Cold Protection", "TEMP", "LT", 20.0, (z2.pk, "HEATER"), "ON", None, 300),
            # If soil humidity < 40 in zone 2, open irrigation
            (z2, "Auto Irrigation", "HUM_SOIL", "LT", 40.0, (z2.pk, "VALVE"), "ON", None, 600),
            # If seedling temp > 28, turn on fan
            (z1, "Seedling Cooling", "TEMP", "GT", 28.0, (z1.pk, "FAN"), "ON", None, 120),
        ]

        for zone, name, stype, cond, threshold, act_key, cmd_type, val, cooldown in rule_defs:
            act = actuator_map.get(act_key)
            if not act:
                continue
            AutomationRule.objects.get_or_create(
                zone=zone,
                name=name,
                defaults={
                    "sensor_type": stype,
                    "condition": cond,
                    "threshold_value": threshold,
                    "action_actuator": act,
                    "action_command_type": cmd_type,
                    "action_value": val,
                    "cooldown_seconds": cooldown,
                },
            )

        self.stdout.write(self.style.SUCCESS(
            f"\nSeed data created:\n"
            f"  User: {SEED_USERNAME} / {SEED_PASSWORD}\n"
            f"  Greenhouses: {Greenhouse.objects.filter(owner=user).count()}\n"
            f"  Zones: {Zone.objects.filter(greenhouse__owner=user).count()}\n"
            f"  Sensors: {Sensor.objects.filter(zone__greenhouse__owner=user).count()}\n"
            f"  Actuators: {Actuator.objects.filter(zone__greenhouse__owner=user).count()}\n"
            f"  Automation Rules: {AutomationRule.objects.filter(zone__greenhouse__owner=user).count()}"
        ))
