"""Enriched demo seed command: 3 organizations, 5 greenhouses, 20 zones, 6 months of data.

Usage::

    python manage.py seed_demo
    python manage.py seed_demo --flush
    python manage.py seed_demo --no-readings    # Skip historical data generation
"""

import math
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Actuator,
    Alert,
    AutomationRule,
    Greenhouse,
    Sensor,
    SensorReading,
    Zone,
)

User = get_user_model()

SENSOR_PROFILES: dict[str, dict] = {
    "TEMP": {"base": 23.0, "amplitude": 5.0, "noise": 0.8, "anomaly_delta": 9.0},
    "HUM_AIR": {"base": 65.0, "amplitude": 10.0, "noise": 3.0, "anomaly_delta": 20.0},
    "HUM_SOIL": {"base": 55.0, "amplitude": 8.0, "noise": 2.0, "anomaly_delta": 15.0},
    "PH": {"base": 6.5, "amplitude": 0.3, "noise": 0.05, "anomaly_delta": 1.2},
    "LIGHT": {"base": 8000.0, "amplitude": 7000.0, "noise": 400.0, "anomaly_delta": 5000.0},
    "CO2": {"base": 600.0, "amplitude": 200.0, "noise": 40.0, "anomaly_delta": 350.0},
}


def _generate_value(sensor_type: str, t_hours: float, anomaly: bool = False) -> float:
    """Generate a diurnal-cycle sensor value.

    Args:
        sensor_type: TEMP, HUM_AIR, etc.
        t_hours: Hour of day (0–23).
        anomaly: Whether to add an anomaly spike.

    Returns:
        Simulated reading value.
    """
    p = SENSOR_PROFILES.get(sensor_type, {"base": 50.0, "amplitude": 5.0, "noise": 1.0, "anomaly_delta": 10.0})
    diurnal = math.sin(2 * math.pi * t_hours / 24.0) * p["amplitude"]
    noise = random.gauss(0, p["noise"])
    value = p["base"] + diurnal + noise
    if anomaly:
        value += random.choice([-1, 1]) * p["anomaly_delta"]
    if sensor_type in ("HUM_AIR", "HUM_SOIL"):
        value = max(0.0, min(100.0, value))
    elif sensor_type == "PH":
        value = max(3.0, min(10.0, value))
    elif sensor_type == "LIGHT":
        value = max(0.0, value)
    elif sensor_type == "CO2":
        value = max(200.0, value)
    return round(value, 2)


# ---------------------------------------------------------------------------
# Demo data definitions
# ---------------------------------------------------------------------------

DEMO_CLIENTS = [
    {
        "username": "demo",
        "email": "demo@greenhouse-saas.com",
        "password": "demo1234",
        "first_name": "Demo",
        "last_name": "User",
        "org_name": "GreenFarm Demo",
        "org_plan": "PRO",
        "is_staff": False,
        "is_superuser": False,
        "readonly": True,
    },
    {
        "username": "alice",
        "email": "alice@maraicheurbain.fr",
        "password": "alice1234!",
        "first_name": "Alice",
        "last_name": "Durand",
        "org_name": "Maraîche Urbain Durand",
        "org_plan": "PRO",
        "is_staff": False,
        "is_superuser": False,
        "readonly": False,
    },
    {
        "username": "bob",
        "email": "bob@hydroponie-nantes.fr",
        "password": "bob1234!",
        "first_name": "Bob",
        "last_name": "Martin",
        "org_name": "Hydroponie Nantes",
        "org_plan": "ENTERPRISE",
        "is_staff": False,
        "is_superuser": False,
        "readonly": False,
    },
]

GREENHOUSES = [
    # (owner_username, name, location, description)
    ("demo", "Serre Tomates", "Site A — Bâtiment Sud", "Production principale de tomates cerises et coeurs de boeuf."),
    ("demo", "Jardin des Herbes", "Site A — Toiture", "Production de basilic, menthe et thym."),
    ("alice", "Laitues Hydro", "Nantes — Hangar 3", "Culture hydroponique de laitues et mâche."),
    ("bob", "Fraises & Framboisiers", "Nantes — Hangar 5", "Petits fruits en culture suspendue."),
    ("bob", "Champignonnière", "Nantes — Cave B", "Production de shiitake et pleurotes."),
]

# zone definitions: (greenhouse_idx, name, relay_id, description, interval_s)
ZONES = [
    (0, "Zone Semis", 1, "Jeunes plants en germination.", 120),
    (0, "Zone Croissance", 2, "Plants en pleine croissance.", 300),
    (0, "Zone Récolte", 3, "Tomates mûres, faible humidité.", 300),
    (0, "Réservoir Nutriments", 4, "Contrôle pH et CE de la solution.", 300),
    (1, "Basilic & Coriandre", 5, "Basilic grand vert et coriandre.", 300),
    (1, "Menthe & Thym", 6, "Menthe poivrée et thym.", 300),
    (2, "Rangée A — Laitues", 7, "Butterhead et Romaine.", 300),
    (2, "Rangée B — Mâche", 8, "Mâche et roquette.", 300),
    (2, "Rangée C — Épinards", 9, "Épinards baby leaf.", 300),
    (2, "Sas d'entrée", 10, "Contrôle climatique entrée.", 600),
    (3, "Rack Fraises A", 11, "Fraises Gariguette en rack.", 300),
    (3, "Rack Fraises B", 12, "Fraises Charlotte en rack.", 300),
    (3, "Rack Framboisiers", 13, "Framboisiers remontants.", 300),
    (4, "Bloc Shiitake", 14, "Blocs de substrat shiitake.", 600),
    (4, "Bloc Pleurotes", 15, "Blocs de substrat pleurotes.", 600),
    (4, "Chambre Humide", 16, "Humidification intensive.", 300),
    (0, "Stockage Récolte", 17, "Chambre froide légère.", 600),
    (2, "Rangée D — Épinards", 18, "Épinards mature leaf.", 300),
    (3, "Zone Pollinisation", 19, "Ruche et circulation d'air.", 600),
    (4, "Couloir Distribution", 20, "Tri et conditionnement.", 600),
]

# sensor defs: (zone_idx, sensor_type, label, unit, min_t, max_t)
SENSOR_DEFS = [
    (0, "TEMP", "Température Semis", "°C", 18.0, 28.0),
    (0, "HUM_AIR", "Humidité Air Semis", "%", 60.0, 90.0),
    (0, "HUM_SOIL", "Humidité Sol Semis", "%", 55.0, 85.0),
    (0, "LIGHT", "Lumière Semis", "lux", 1000.0, 8000.0),
    (1, "TEMP", "Température Croissance", "°C", 20.0, 32.0),
    (1, "HUM_AIR", "Humidité Air Croissance", "%", 50.0, 75.0),
    (1, "HUM_SOIL", "Humidité Sol Croissance", "%", 40.0, 70.0),
    (1, "PH", "pH Nutriments", "", 5.5, 7.0),
    (1, "CO2", "CO2 Croissance", "ppm", 300.0, 1200.0),
    (1, "LIGHT", "Lumière Croissance", "lux", 5000.0, 30000.0),
    (2, "TEMP", "Température Récolte", "°C", 18.0, 25.0),
    (2, "HUM_AIR", "Humidité Air Récolte", "%", 40.0, 65.0),
    (3, "TEMP", "Température Réservoir", "°C", 18.0, 24.0),
    (3, "PH", "pH Réservoir", "", 5.5, 6.5),
    (4, "TEMP", "Température Basilic", "°C", 20.0, 30.0),
    (4, "HUM_AIR", "Humidité Air Basilic", "%", 50.0, 75.0),
    (4, "LIGHT", "Lumière Basilic", "lux", 4000.0, 20000.0),
    (5, "TEMP", "Température Menthe", "°C", 15.0, 25.0),
    (5, "HUM_SOIL", "Humidité Sol Menthe", "%", 50.0, 80.0),
    (6, "TEMP", "Température Laitues A", "°C", 18.0, 24.0),
    (6, "HUM_AIR", "Humidité Laitues A", "%", 50.0, 75.0),
    (6, "CO2", "CO2 Laitues A", "ppm", 400.0, 1000.0),
    (7, "TEMP", "Température Mâche", "°C", 15.0, 22.0),
    (7, "HUM_AIR", "Humidité Mâche", "%", 55.0, 80.0),
    (8, "TEMP", "Température Épinards", "°C", 12.0, 20.0),
    (10, "TEMP", "Température Fraises A", "°C", 18.0, 26.0),
    (10, "HUM_AIR", "Humidité Fraises A", "%", 50.0, 70.0),
    (11, "TEMP", "Température Fraises B", "°C", 18.0, 26.0),
    (12, "TEMP", "Température Framboisiers", "°C", 15.0, 25.0),
    (13, "TEMP", "Température Shiitake", "°C", 20.0, 28.0),
    (13, "HUM_AIR", "Humidité Shiitake", "%", 70.0, 95.0),
    (14, "TEMP", "Température Pleurotes", "°C", 18.0, 26.0),
    (14, "HUM_AIR", "Humidité Pleurotes", "%", 75.0, 95.0),
    (15, "TEMP", "Température Chambre Humide", "°C", 18.0, 24.0),
    (15, "HUM_AIR", "Humidité Chambre Humide", "%", 85.0, 99.0),
]

# actuator defs: (zone_idx, actuator_type, name, gpio)
ACTUATOR_DEFS = [
    (0, "FAN", "Ventilateur Semis", 4),
    (0, "VALVE", "Irrigation Semis", 5),
    (0, "LIGHT", "Lampe LED Semis", 6),
    (1, "FAN", "Ventilateur Croissance", 4),
    (1, "VALVE", "Irrigation Croissance", 5),
    (1, "HEATER", "Chauffage Croissance", 7),
    (1, "PUMP", "Pompe Nutriments", 8),
    (2, "FAN", "Ventilateur Récolte", 4),
    (4, "VALVE", "Irrigation Basilic", 5),
    (4, "LIGHT", "Lampe LED Basilic", 6),
    (5, "VALVE", "Irrigation Menthe", 5),
    (6, "FAN", "Ventilateur Laitues A", 4),
    (6, "PUMP", "Pompe NFT A", 5),
    (13, "FAN", "Ventilateur Shiitake", 4),
    (14, "FAN", "Ventilateur Pleurotes", 4),
    (15, "VALVE", "Brumisateur Chambre", 5),
]


class Command(BaseCommand):
    """Create enriched demo seed data: 3 clients, 5 greenhouses, 20 zones, 6 months of readings."""

    help = "Create enriched demo data with 6 months of historical sensor readings"

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all existing IoT data before seeding",
        )
        parser.add_argument(
            "--no-readings",
            action="store_true",
            help="Skip historical sensor readings (faster for structure-only seeding)",
        )
        parser.add_argument(
            "--months",
            type=int,
            default=6,
            help="Number of months of historical data to generate (default: 6)",
        )
        parser.add_argument(
            "--interval-hours",
            type=int,
            default=1,
            help="Reading interval in hours (default: 1 = one reading per hour per sensor)",
        )

    def handle(self, *args, **options):  # noqa: C901
        if options["flush"]:
            self.stdout.write("Flushing existing IoT data...")
            Alert.objects.all().delete()
            AutomationRule.objects.all().delete()
            Actuator.objects.all().delete()
            Sensor.objects.all().delete()
            Zone.objects.all().delete()
            Greenhouse.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Flushed."))

        # ------------------------------------------------------------------ #
        # Users & Organizations
        # ------------------------------------------------------------------ #
        users: dict[str, User] = {}
        orgs: dict[str, Organization] = {}

        for client in DEMO_CLIENTS:
            user, created = User.objects.get_or_create(
                username=client["username"],
                defaults={
                    "email": client["email"],
                    "first_name": client["first_name"],
                    "last_name": client["last_name"],
                    "is_staff": client["is_staff"],
                    "is_superuser": client["is_superuser"],
                },
            )
            if created:
                user.set_password(client["password"])
                user.save()
                self.stdout.write(self.style.SUCCESS(f"  Created user: {client['username']} / {client['password']}"))
            else:
                self.stdout.write(f"  User '{client['username']}' already exists — skipping.")
            users[client["username"]] = user

            # Organization
            membership = Membership.objects.filter(user=user, role=Membership.Role.OWNER).first()
            if membership:
                org = membership.organization
            else:
                slug = slugify(client["org_name"]) or f"org-{user.pk}"
                plan_map = {
                    "FREE": Organization.Plan.FREE,
                    "PRO": Organization.Plan.PRO,
                    "ENTERPRISE": Organization.Plan.ENTERPRISE,
                }
                org, _ = Organization.objects.get_or_create(
                    slug=slug,
                    defaults={
                        "name": client["org_name"],
                        "plan": plan_map.get(client["org_plan"], Organization.Plan.PRO),
                    },
                )
                Membership.objects.get_or_create(user=user, organization=org, defaults={"role": Membership.Role.OWNER})
            orgs[client["username"]] = org
            self.stdout.write(f"  Organization: {org.name}")

        # ------------------------------------------------------------------ #
        # Greenhouses
        # ------------------------------------------------------------------ #
        greenhouse_objects: list[Greenhouse] = []
        for owner_username, name, location, description in GREENHOUSES:
            owner = users[owner_username]
            org = orgs[owner_username]
            gh, _ = Greenhouse.objects.get_or_create(
                organization=org,
                name=name,
                defaults={"owner": owner, "location": location, "description": description},
            )
            greenhouse_objects.append(gh)
        self.stdout.write(f"  Greenhouses: {len(greenhouse_objects)}")

        # ------------------------------------------------------------------ #
        # Zones
        # ------------------------------------------------------------------ #
        zone_objects: list[Zone] = []
        for gh_idx, name, relay_id, description, interval_s in ZONES:
            gh = greenhouse_objects[gh_idx]
            zone, _ = Zone.objects.get_or_create(
                relay_id=relay_id,
                defaults={"greenhouse": gh, "name": name, "description": description, "transmission_interval": interval_s},
            )
            zone_objects.append(zone)
        self.stdout.write(f"  Zones: {len(zone_objects)}")

        # ------------------------------------------------------------------ #
        # Sensors
        # ------------------------------------------------------------------ #
        sensor_objects: dict[int, Sensor] = {}
        for i, (zone_idx, stype, label, unit, min_t, max_t) in enumerate(SENSOR_DEFS):
            zone = zone_objects[zone_idx]
            sensor, _ = Sensor.objects.get_or_create(
                zone=zone,
                sensor_type=stype,
                defaults={"label": label, "unit": unit, "min_threshold": min_t, "max_threshold": max_t},
            )
            sensor_objects[i] = sensor
        self.stdout.write(f"  Sensors: {len(sensor_objects)}")

        # ------------------------------------------------------------------ #
        # Actuators
        # ------------------------------------------------------------------ #
        actuator_objects: dict[tuple[int, str], Actuator] = {}
        for zone_idx, atype, name, pin in ACTUATOR_DEFS:
            zone = zone_objects[zone_idx]
            act, _ = Actuator.objects.get_or_create(
                zone=zone,
                name=name,
                defaults={"actuator_type": atype, "gpio_pin": pin},
            )
            actuator_objects[(zone_idx, atype)] = act
        self.stdout.write(f"  Actuators: {len(actuator_objects)}")

        # ------------------------------------------------------------------ #
        # Automation rules (for demo org only)
        # ------------------------------------------------------------------ #
        rule_defs = [
            (1, "Protection Surchauffe", "TEMP", "GT", 31.0, (1, "FAN"), "ON", None, 300),
            (1, "Protection Froid", "TEMP", "LT", 20.0, (1, "HEATER"), "ON", None, 300),
            (1, "Irrigation Auto", "HUM_SOIL", "LT", 40.0, (1, "VALVE"), "ON", None, 600),
            (0, "Refroidissement Semis", "TEMP", "GT", 28.0, (0, "FAN"), "ON", None, 120),
        ]
        for zone_idx, name, stype, cond, threshold, act_key, cmd_type, val, cooldown in rule_defs:
            zone = zone_objects[zone_idx]
            act = actuator_objects.get(act_key)
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

        # ------------------------------------------------------------------ #
        # Historical sensor readings
        # ------------------------------------------------------------------ #
        if options["no_readings"]:
            self.stdout.write(self.style.WARNING("  Skipping historical readings (--no-readings)."))
        else:
            months = options["months"]
            interval_hours = options["interval_hours"]
            now = timezone.now()
            start = now - timedelta(days=30 * months)
            total_hours = int((now - start).total_seconds() / 3600)
            step = max(interval_hours, 1)

            self.stdout.write(
                f"  Generating {months} months of readings "
                f"({total_hours // step} steps × {len(sensor_objects)} sensors)..."
            )

            # Batch insert for performance
            readings_to_create: list[SensorReading] = []
            batch_size = 2000
            total_created = 0

            for step_idx in range(0, total_hours, step):
                ts = start + timedelta(hours=step_idx)
                t_hours = ts.hour + ts.minute / 60.0
                # 2% chance of anomaly per reading
                for sensor_def_idx, sensor in sensor_objects.items():
                    stype = SENSOR_DEFS[sensor_def_idx][1]
                    anomaly = random.random() < 0.02
                    value = _generate_value(stype, t_hours, anomaly=anomaly)
                    readings_to_create.append(
                        SensorReading(sensor=sensor, value=value, received_at=ts)
                    )

                if len(readings_to_create) >= batch_size:
                    SensorReading.objects.bulk_create(readings_to_create, ignore_conflicts=True)
                    total_created += len(readings_to_create)
                    readings_to_create = []
                    self.stdout.write(f"    ... {total_created:,} readings inserted", ending="\r")
                    self.stdout.flush()

            if readings_to_create:
                SensorReading.objects.bulk_create(readings_to_create, ignore_conflicts=True)
                total_created += len(readings_to_create)

            self.stdout.write(f"\n  Historical readings created: {total_created:,}")

        self.stdout.write(
            self.style.SUCCESS(
                "\nDemo seed complete:\n"
                f"  Users: {', '.join(c['username'] + '/' + c['password'] for c in DEMO_CLIENTS)}\n"
                f"  Read-only demo: demo@greenhouse-saas.com / demo1234\n"
                f"  Greenhouses: {len(greenhouse_objects)}\n"
                f"  Zones: {len(zone_objects)}\n"
                f"  Sensors: {len(sensor_objects)}\n"
                f"  Actuators: {len(actuator_objects)}"
            )
        )
