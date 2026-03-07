"""Migration: relay_id unique per greenhouse instead of globally.

Removes the global unique constraint on Zone.relay_id and replaces it with a
unique_together constraint on (greenhouse, relay_id).  This allows two
different clients/greenhouses to both have a relay node with ID=1, which is
the correct semantic for a local LoRa network address.
"""

from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("iot", "0018_sprint31_crop_intelligence"),
    ]

    operations = [
        migrations.AlterField(
            model_name="zone",
            name="relay_id",
            field=models.PositiveIntegerField(
                help_text="LoRa relay node ID (1\u2013255). Unique per greenhouse (local LoRa network).",
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(255),
                ],
            ),
        ),
        migrations.AlterUniqueTogether(
            name="zone",
            unique_together={("greenhouse", "relay_id")},
        ),
    ]
