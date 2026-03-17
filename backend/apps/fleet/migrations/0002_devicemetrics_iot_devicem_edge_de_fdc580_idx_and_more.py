# State-only migration: indexes already exist in the DB (created by apps.iot migrations).
# database_operations=[] ensures no DDL is executed.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("fleet", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name="devicemetrics",
                    index=models.Index(
                        fields=["edge_device", "-recorded_at"],
                        name="iot_devicem_edge_de_fdc580_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="syncbatch",
                    index=models.Index(
                        fields=["edge_device", "-started_at"],
                        name="iot_syncbat_edge_de_c5f997_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="syncbatch",
                    index=models.Index(
                        fields=["status", "next_retry_at"],
                        name="iot_syncbat_status_82584f_idx",
                    ),
                ),
            ],
        ),
    ]
