"""Django management command to run the MQTT ingestion worker.

Usage::

    python manage.py run_mqtt_worker
"""

from django.core.management.base import BaseCommand

from apps.iot.mqtt_worker import MqttWorker


class Command(BaseCommand):
    """Start the MQTT worker that ingests sensor data from the LoRa bridge."""

    help = "Start the MQTT worker for sensor data ingestion"

    def handle(self, *args: object, **options: object) -> None:
        """Entry point for the management command."""
        self.stdout.write(self.style.SUCCESS("Starting MQTT worker..."))
        worker = MqttWorker()
        worker.start()
