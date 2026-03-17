# State-only migration: indexes already exist in the DB (created by apps.iot migrations).
# database_operations=[] ensures no DDL is executed.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("greenhouse", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name="sensorreading",
                    index=models.Index(
                        fields=["sensor", "-received_at"],
                        name="iot_sensorr_sensor__3b51ef_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="sensorreading",
                    index=models.Index(
                        fields=["-received_at"],
                        name="iot_sensorr_receive_1e09e3_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="sensorreading",
                    index=models.Index(
                        fields=["cloud_synced", "-received_at"],
                        name="iot_sensorr_cloud_s_83af03_idx",
                    ),
                ),
            ],
        ),
    ]
