"""Django management command to seed marketplace template data.

Usage::

    python manage.py seed_templates
    python manage.py seed_templates --flush   # Delete existing templates first
"""

from django.core.management.base import BaseCommand

from apps.iot.models import Template, TemplateCategory

CATEGORIES = [
    {"name": "Vegetables", "slug": "vegetables", "icon": "leaf", "order": 1,
     "description": "Templates for vegetable cultivation: tomatoes, lettuce, peppers, etc."},
    {"name": "Fruits", "slug": "fruits", "icon": "apple", "order": 2,
     "description": "Templates for fruit growing: strawberries, melons, blueberries, etc."},
    {"name": "Herbs", "slug": "herbs", "icon": "herb", "order": 3,
     "description": "Templates for herb gardens: basil, mint, rosemary, etc."},
    {"name": "Flowers", "slug": "flowers", "icon": "flower", "order": 4,
     "description": "Templates for flower cultivation: tulips, roses, orchids, etc."},
    {"name": "Hydroponics", "slug": "hydroponics", "icon": "droplet", "order": 5,
     "description": "Templates for hydroponic systems: NFT, DWC, ebb and flow."},
    {"name": "Mushrooms", "slug": "mushrooms", "icon": "mushroom", "order": 6,
     "description": "Templates for mushroom growing: oyster, shiitake, button."},
]

OFFICIAL_TEMPLATES = [
    {
        "name": "Tomato Greenhouse",
        "category_slug": "vegetables",
        "description": "Complete setup for tomato cultivation. Includes temperature, humidity and soil moisture monitoring with automated irrigation and ventilation.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Air Temperature", "unit": "\u00b0C", "min_threshold": 15.0, "max_threshold": 32.0},
                {"sensor_type": "HUM_AIR", "label": "Air Humidity", "unit": "%", "min_threshold": 50.0, "max_threshold": 80.0},
                {"sensor_type": "HUM_SOIL", "label": "Soil Moisture", "unit": "%", "min_threshold": 40.0, "max_threshold": 70.0},
                {"sensor_type": "LIGHT", "label": "Light Level", "unit": "lux", "min_threshold": 10000.0, "max_threshold": None},
            ],
            "actuators": [
                {"actuator_type": "VALVE", "name": "Drip Irrigation Valve", "gpio_pin": 4},
                {"actuator_type": "FAN", "name": "Ventilation Fan", "gpio_pin": 5},
                {"actuator_type": "SHADE", "name": "Shade Screen", "gpio_pin": 6},
            ],
            "automation_rules": [
                {"name": "Low soil moisture irrigation", "description": "Turn on irrigation when soil moisture drops below 40%", "sensor_type": "HUM_SOIL", "condition": "LT", "threshold_value": 40.0, "action_actuator_name": "Drip Irrigation Valve", "action_actuator_type": "VALVE", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 600},
                {"name": "High temperature ventilation", "description": "Activate fan when temperature exceeds 30\u00b0C", "sensor_type": "TEMP", "condition": "GT", "threshold_value": 30.0, "action_actuator_name": "Ventilation Fan", "action_actuator_type": "FAN", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 300},
            ],
            "scenarios": [
                {"name": "Morning Watering", "description": "20-minute drip irrigation cycle", "steps": [
                    {"order": 0, "action": "ON", "action_value": None, "delay_seconds": 0, "duration_seconds": 1200, "actuator_name": "Drip Irrigation Valve", "actuator_type": "VALVE"},
                ]},
            ],
        },
    },
    {
        "name": "Lettuce Production",
        "category_slug": "vegetables",
        "description": "Optimized for leafy greens. Cool temperatures, high humidity, and consistent moisture for rapid lettuce growth.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Air Temperature", "unit": "\u00b0C", "min_threshold": 10.0, "max_threshold": 24.0},
                {"sensor_type": "HUM_AIR", "label": "Air Humidity", "unit": "%", "min_threshold": 60.0, "max_threshold": 90.0},
                {"sensor_type": "HUM_SOIL", "label": "Soil Moisture", "unit": "%", "min_threshold": 50.0, "max_threshold": 80.0},
            ],
            "actuators": [
                {"actuator_type": "VALVE", "name": "Mist Irrigation", "gpio_pin": 4},
                {"actuator_type": "FAN", "name": "Cooling Fan", "gpio_pin": 5},
            ],
            "automation_rules": [
                {"name": "Mist when dry", "description": "Activate mist system when soil moisture is low", "sensor_type": "HUM_SOIL", "condition": "LT", "threshold_value": 50.0, "action_actuator_name": "Mist Irrigation", "action_actuator_type": "VALVE", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 900},
                {"name": "Cool when hot", "description": "Turn on fan when temperature exceeds 22\u00b0C", "sensor_type": "TEMP", "condition": "GT", "threshold_value": 22.0, "action_actuator_name": "Cooling Fan", "action_actuator_type": "FAN", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 300},
            ],
            "scenarios": [],
        },
    },
    {
        "name": "Strawberry Garden",
        "category_slug": "fruits",
        "description": "Ideal conditions for strawberry cultivation with pH monitoring and automated drip irrigation.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Air Temperature", "unit": "\u00b0C", "min_threshold": 15.0, "max_threshold": 28.0},
                {"sensor_type": "HUM_AIR", "label": "Air Humidity", "unit": "%", "min_threshold": 60.0, "max_threshold": 80.0},
                {"sensor_type": "HUM_SOIL", "label": "Soil Moisture", "unit": "%", "min_threshold": 45.0, "max_threshold": 65.0},
                {"sensor_type": "PH", "label": "Soil pH", "unit": "pH", "min_threshold": 5.5, "max_threshold": 6.8},
            ],
            "actuators": [
                {"actuator_type": "VALVE", "name": "Drip Line", "gpio_pin": 4},
                {"actuator_type": "FAN", "name": "Air Circulation Fan", "gpio_pin": 5},
            ],
            "automation_rules": [
                {"name": "Strawberry irrigation", "description": "Water when soil dries out", "sensor_type": "HUM_SOIL", "condition": "LT", "threshold_value": 45.0, "action_actuator_name": "Drip Line", "action_actuator_type": "VALVE", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 600},
            ],
            "scenarios": [],
        },
    },
    {
        "name": "Basil Herb Garden",
        "category_slug": "herbs",
        "description": "Warm conditions with good light for aromatic basil production. Includes grow light control.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Air Temperature", "unit": "\u00b0C", "min_threshold": 20.0, "max_threshold": 30.0},
                {"sensor_type": "HUM_AIR", "label": "Air Humidity", "unit": "%", "min_threshold": 40.0, "max_threshold": 70.0},
                {"sensor_type": "LIGHT", "label": "Light Intensity", "unit": "lux", "min_threshold": 15000.0, "max_threshold": None},
            ],
            "actuators": [
                {"actuator_type": "VALVE", "name": "Watering Valve", "gpio_pin": 4},
                {"actuator_type": "LIGHT", "name": "Grow Light", "gpio_pin": 7},
            ],
            "automation_rules": [
                {"name": "Low light supplement", "description": "Turn on grow light when natural light is insufficient", "sensor_type": "LIGHT", "condition": "LT", "threshold_value": 15000.0, "action_actuator_name": "Grow Light", "action_actuator_type": "LIGHT", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 600},
            ],
            "scenarios": [],
        },
    },
    {
        "name": "Tulip Forcing",
        "category_slug": "flowers",
        "description": "Temperature-controlled setup for tulip forcing. Precise cooling and warming phases.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Air Temperature", "unit": "\u00b0C", "min_threshold": 2.0, "max_threshold": 20.0},
                {"sensor_type": "HUM_AIR", "label": "Air Humidity", "unit": "%", "min_threshold": 70.0, "max_threshold": 90.0},
            ],
            "actuators": [
                {"actuator_type": "HEATER", "name": "Zone Heater", "gpio_pin": 8},
                {"actuator_type": "FAN", "name": "Ventilation Fan", "gpio_pin": 5},
                {"actuator_type": "VALVE", "name": "Irrigation Valve", "gpio_pin": 4},
            ],
            "automation_rules": [
                {"name": "Heating for forcing", "description": "Heat when below target temperature", "sensor_type": "TEMP", "condition": "LT", "threshold_value": 15.0, "action_actuator_name": "Zone Heater", "action_actuator_type": "HEATER", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 600},
            ],
            "scenarios": [],
        },
    },
    {
        "name": "NFT Hydroponics",
        "category_slug": "hydroponics",
        "description": "Nutrient Film Technique setup with pH, temperature and light monitoring. Pump-based nutrient delivery.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Water Temperature", "unit": "\u00b0C", "min_threshold": 18.0, "max_threshold": 26.0},
                {"sensor_type": "PH", "label": "Nutrient pH", "unit": "pH", "min_threshold": 5.5, "max_threshold": 6.5},
                {"sensor_type": "LIGHT", "label": "Light Level", "unit": "lux", "min_threshold": 10000.0, "max_threshold": None},
                {"sensor_type": "CO2", "label": "CO2 Level", "unit": "ppm", "min_threshold": 400.0, "max_threshold": 1200.0},
            ],
            "actuators": [
                {"actuator_type": "PUMP", "name": "Nutrient Pump", "gpio_pin": 4},
                {"actuator_type": "LIGHT", "name": "Grow Light Array", "gpio_pin": 7},
                {"actuator_type": "FAN", "name": "Air Exchange Fan", "gpio_pin": 5},
            ],
            "automation_rules": [
                {"name": "Nutrient circulation", "description": "Run pump intermittently", "sensor_type": "TEMP", "condition": "GT", "threshold_value": 0.0, "action_actuator_name": "Nutrient Pump", "action_actuator_type": "PUMP", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 900},
                {"name": "CO2 ventilation", "description": "Ventilate when CO2 too high", "sensor_type": "CO2", "condition": "GT", "threshold_value": 1200.0, "action_actuator_name": "Air Exchange Fan", "action_actuator_type": "FAN", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 300},
            ],
            "scenarios": [
                {"name": "Nutrient Cycle", "description": "15-minute pump cycle every hour", "steps": [
                    {"order": 0, "action": "ON", "action_value": None, "delay_seconds": 0, "duration_seconds": 900, "actuator_name": "Nutrient Pump", "actuator_type": "PUMP"},
                ]},
            ],
        },
    },
    {
        "name": "Oyster Mushroom Chamber",
        "category_slug": "mushrooms",
        "description": "High humidity, low light setup for oyster mushroom cultivation with CO2 monitoring.",
        "config": {
            "sensors": [
                {"sensor_type": "TEMP", "label": "Chamber Temperature", "unit": "\u00b0C", "min_threshold": 15.0, "max_threshold": 24.0},
                {"sensor_type": "HUM_AIR", "label": "Chamber Humidity", "unit": "%", "min_threshold": 85.0, "max_threshold": 95.0},
                {"sensor_type": "CO2", "label": "CO2 Level", "unit": "ppm", "min_threshold": 400.0, "max_threshold": 800.0},
            ],
            "actuators": [
                {"actuator_type": "VALVE", "name": "Humidifier Valve", "gpio_pin": 4},
                {"actuator_type": "FAN", "name": "Fresh Air Fan", "gpio_pin": 5},
            ],
            "automation_rules": [
                {"name": "Maintain humidity", "description": "Activate humidifier when humidity drops", "sensor_type": "HUM_AIR", "condition": "LT", "threshold_value": 85.0, "action_actuator_name": "Humidifier Valve", "action_actuator_type": "VALVE", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 300},
                {"name": "CO2 extraction", "description": "Fresh air exchange when CO2 too high", "sensor_type": "CO2", "condition": "GT", "threshold_value": 800.0, "action_actuator_name": "Fresh Air Fan", "action_actuator_type": "FAN", "action_command_type": "ON", "action_value": None, "cooldown_seconds": 300},
            ],
            "scenarios": [],
        },
    },
]


class Command(BaseCommand):
    """Seed the marketplace with template categories and official templates."""

    help = "Create official marketplace template categories and templates"

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete all existing templates and categories before seeding",
        )

    def handle(self, *args, **options):
        if options["flush"]:
            self.stdout.write("Flushing existing templates...")
            Template.objects.all().delete()
            TemplateCategory.objects.all().delete()
            self.stdout.write(self.style.WARNING("  Flushed."))

        # Create categories
        category_map: dict[str, TemplateCategory] = {}
        for cat_data in CATEGORIES:
            cat, created = TemplateCategory.objects.update_or_create(
                slug=cat_data["slug"],
                defaults={
                    "name": cat_data["name"],
                    "description": cat_data["description"],
                    "icon": cat_data["icon"],
                    "order": cat_data["order"],
                },
            )
            category_map[cat.slug] = cat
            status_text = "Created" if created else "Updated"
            self.stdout.write(f"  {status_text} category: {cat.name}")

        # Create official templates
        for tmpl_data in OFFICIAL_TEMPLATES:
            category = category_map.get(tmpl_data["category_slug"])
            tmpl, created = Template.objects.update_or_create(
                name=tmpl_data["name"],
                is_official=True,
                defaults={
                    "category": category,
                    "description": tmpl_data["description"],
                    "config": tmpl_data["config"],
                    "is_published": True,
                    "version": "1.0.0",
                    "changelog": "Initial official release.",
                },
            )
            status_text = "Created" if created else "Updated"
            self.stdout.write(f"  {status_text} template: {tmpl.name}")

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone! {len(CATEGORIES)} categories, {len(OFFICIAL_TEMPLATES)} official templates."
            )
        )
