"""Management command to create or reset the sandbox organization with simulated data."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.api.models import APIKey, Membership, Organization, Webhook
from apps.iot.models import Actuator, Greenhouse, Sensor, Zone

User = get_user_model()


class Command(BaseCommand):
    """Create or reset the sandbox organization with simulated data for API testing."""

    help = "Create or reset the sandbox organization with simulated data for API testing."

    def handle(self, *args, **options):
        """Set up the sandbox organization, user, greenhouse, zones, sensors, actuators, API key, and webhook."""
        self.stdout.write(self.style.MIGRATE_HEADING("Setting up sandbox environment..."))

        # --- Organization ---
        org, org_created = Organization.objects.get_or_create(
            slug="sandbox",
            defaults={
                "name": "Sandbox (Dev)",
                "plan": Organization.Plan.PRO,
            },
        )
        if not org_created:
            # Ensure plan is PRO even if the org already existed
            org.plan = Organization.Plan.PRO
            org.name = "Sandbox (Dev)"
            org.save(update_fields=["plan", "name"])
        self._log_created("Organization", org.name, org_created)

        # --- User ---
        user, user_created = User.objects.get_or_create(
            username="sandbox_user",
            defaults={
                "email": "sandbox@greenhouse.dev",
                "is_active": True,
            },
        )
        if user_created:
            user.set_password("sandbox123!")
            user.save()
        self._log_created("User", user.username, user_created)

        # --- Membership ---
        membership, mem_created = Membership.objects.get_or_create(
            user=user,
            organization=org,
            defaults={"role": Membership.Role.OWNER},
        )
        if not mem_created:
            membership.role = Membership.Role.OWNER
            membership.save(update_fields=["role"])
        self._log_created("Membership", f"{user.username} -> {org.name} (OWNER)", mem_created)

        # --- Greenhouse ---
        greenhouse, gh_created = Greenhouse.objects.get_or_create(
            organization=org,
            name="Demo Greenhouse",
            defaults={
                "owner": user,
                "location": "Demo Location",
                "description": "Sandbox greenhouse for developer testing.",
                "is_active": True,
            },
        )
        self._log_created("Greenhouse", greenhouse.name, gh_created)

        # --- Zones ---
        zones_config = [
            {"name": "Zone A", "relay_id": 100},
            {"name": "Zone B", "relay_id": 101},
        ]
        zones = []
        for zone_cfg in zones_config:
            zone, zone_created = Zone.objects.get_or_create(
                greenhouse=greenhouse,
                name=zone_cfg["name"],
                defaults={
                    "relay_id": zone_cfg["relay_id"],
                    "description": f"Sandbox {zone_cfg['name']}",
                    "is_active": True,
                },
            )
            zones.append(zone)
            self._log_created("Zone", zone.name, zone_created)

        # --- Sensors (TEMP + HUM_AIR per zone) ---
        sensor_configs = [
            {
                "sensor_type": Sensor.SensorType.TEMPERATURE,
                "label": "Temperature",
                "unit": "\u00b0C",
                "min_threshold": 15.0,
                "max_threshold": 35.0,
            },
            {
                "sensor_type": Sensor.SensorType.HUMIDITY_AIR,
                "label": "Air Humidity",
                "unit": "%",
                "min_threshold": 40.0,
                "max_threshold": 90.0,
            },
        ]
        for zone in zones:
            for s_cfg in sensor_configs:
                sensor, sensor_created = Sensor.objects.get_or_create(
                    zone=zone,
                    sensor_type=s_cfg["sensor_type"],
                    defaults={
                        "label": s_cfg["label"],
                        "unit": s_cfg["unit"],
                        "min_threshold": s_cfg["min_threshold"],
                        "max_threshold": s_cfg["max_threshold"],
                        "is_active": True,
                    },
                )
                self._log_created("Sensor", f"{zone.name}/{sensor.get_sensor_type_display()}", sensor_created)

        # --- Actuators (VALVE + FAN per zone) ---
        actuator_configs = [
            {
                "actuator_type": Actuator.ActuatorType.VALVE,
                "name_suffix": "Water Valve",
                "gpio_pin": 4,
            },
            {
                "actuator_type": Actuator.ActuatorType.FAN,
                "name_suffix": "Ventilation Fan",
                "gpio_pin": 5,
            },
        ]
        for zone in zones:
            for a_cfg in actuator_configs:
                actuator_name = f"{zone.name} {a_cfg['name_suffix']}"
                actuator, act_created = Actuator.objects.get_or_create(
                    zone=zone,
                    actuator_type=a_cfg["actuator_type"],
                    defaults={
                        "name": actuator_name,
                        "gpio_pin": a_cfg["gpio_pin"],
                        "state": False,
                        "is_active": True,
                    },
                )
                self._log_created("Actuator", actuator.name, act_created)

        # --- API Key ---
        existing_keys = APIKey.objects.filter(organization=org, name="Sandbox Key")
        if existing_keys.exists():
            self.stdout.write(f"  API Key 'Sandbox Key' already exists (prefix: {existing_keys.first().prefix}...)")
            raw_key = None
        else:
            api_key_instance, raw_key = APIKey.create_key(
                organization=org,
                name="Sandbox Key",
                scope=APIKey.Scope.WRITE,
                created_by=user,
            )
            self.stdout.write(self.style.SUCCESS(f"  [CREATED] API Key: {api_key_instance.name}"))

        # --- Webhook ---
        webhook, wh_created = Webhook.objects.get_or_create(
            organization=org,
            name="Test Webhook",
            defaults={
                "url": "https://httpbin.org/post",
                "events": ["new_reading", "alert_created"],
                "is_active": True,
                "created_by": user,
            },
        )
        self._log_created("Webhook", webhook.name, wh_created)

        # --- Summary ---
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("  Sandbox setup complete!"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(f"  Organization : {org.name} (slug={org.slug}, plan={org.plan})")
        self.stdout.write(f"  User         : {user.username} (password: sandbox123!)")
        self.stdout.write(f"  Membership   : {membership.role}")
        self.stdout.write(f"  Greenhouse   : {greenhouse.name}")
        self.stdout.write(f"  Zones        : {', '.join(z.name for z in zones)}")
        self.stdout.write(f"  Sensors/zone : TEMP, HUM_AIR")
        self.stdout.write(f"  Actuators/zone: VALVE, FAN")
        if raw_key:
            self.stdout.write(self.style.WARNING(f"  API Key (raw): {raw_key}"))
            self.stdout.write(self.style.WARNING("  (Save this key! It cannot be retrieved again.)"))
        else:
            first_key = existing_keys.first()
            self.stdout.write(f"  API Key      : already exists (prefix: {first_key.prefix}...)")
        self.stdout.write(f"  Webhook      : {webhook.name} -> {webhook.url}")
        self.stdout.write("")

    def _log_created(self, model_name: str, label: str, created: bool) -> None:
        """Log whether a model instance was created or already existed."""
        if created:
            self.stdout.write(self.style.SUCCESS(f"  [CREATED] {model_name}: {label}"))
        else:
            self.stdout.write(f"  [EXISTS]  {model_name}: {label}")
