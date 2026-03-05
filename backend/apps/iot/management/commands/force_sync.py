"""Management command: force_sync — trigger an immediate edge → cloud sync.

Usage:
    python manage.py force_sync
    python manage.py force_sync --device <device_id_or_name>
    python manage.py force_sync --batch-size 1000
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.iot.models import EdgeDevice
from apps.iot.sync_agent import _run_sync

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """Trigger an immediate edge-to-cloud sync for one or all active devices."""

    help = "Force an immediate sync of edge data to the cloud API."

    def add_arguments(self, parser):
        parser.add_argument(
            "--device",
            type=str,
            default=None,
            metavar="DEVICE",
            help="Device ID (UUID) or name. Omit to sync all active devices.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=5000,
            dest="batch_size",
            metavar="N",
            help="Maximum records per sync batch (default: 5000).",
        )

    def handle(self, *args, **options) -> None:
        device_filter = options["device"]
        batch_size = options["batch_size"]

        if device_filter:
            # Try UUID first, fall back to name
            qs = EdgeDevice.objects.filter(is_active=True)
            try:
                devices = qs.filter(device_id=device_filter)
            except Exception:
                devices = qs.none()
            if not devices.exists():
                devices = EdgeDevice.objects.filter(is_active=True, name__icontains=device_filter)
            if not devices.exists():
                raise CommandError(f"No active EdgeDevice matching '{device_filter}'.")
        else:
            devices = EdgeDevice.objects.filter(is_active=True)

        if not devices.exists():
            self.stderr.write(self.style.WARNING("No active edge devices found."))
            return

        total_synced = 0
        for device in devices:
            self.stdout.write(f"Syncing device '{device.name}' ({device.device_id}) …")
            try:
                result = _run_sync(device, batch_size=batch_size)
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  ERROR: {exc}"))
                logger.exception("force_sync failed for device %s", device.name)
                continue

            if result.get("skipped"):
                self.stdout.write(self.style.WARNING(f"  Skipped: {result.get('reason')}"))
            elif "error" in result:
                self.stderr.write(
                    self.style.ERROR(
                        f"  Failed — will retry at {result.get('next_retry_at', 'unknown')}: {result['error']}"
                    )
                )
            else:
                synced = result.get("records_synced", 0)
                total_synced += synced
                kb = result.get("payload_kb", 0)
                self.stdout.write(
                    self.style.SUCCESS(f"  OK — {synced} records synced ({kb:.1f} KB compressed)")
                )

        self.stdout.write(self.style.SUCCESS(f"\nTotal records synced: {total_synced}"))
