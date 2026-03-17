# State-only migration: indexes already exist in the DB (created by apps.iot migrations).
# database_operations=[] ensures no DDL is executed.

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("compliance", "0001_initial"),
        ("greenhouse", "0002_sensorreading_iot_sensorr_sensor__3b51ef_idx_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name="cropcycle",
                    index=models.Index(
                        fields=["zone", "-created_at"],
                        name="iot_cropcyc_zone_id_f81d2d_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="cropcycle",
                    index=models.Index(
                        fields=["status"],
                        name="iot_cropcyc_status_4486fb_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="culturelog",
                    index=models.Index(
                        fields=["zone", "-created_at"],
                        name="iot_culture_zone_id_f46b69_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="culturelog",
                    index=models.Index(
                        fields=["entry_type", "-created_at"],
                        name="iot_culture_entry_t_3b0d81_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="culturelog",
                    index=models.Index(
                        fields=["crop_cycle", "-created_at"],
                        name="iot_culture_crop_cy_a8216b_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="note",
                    index=models.Index(
                        fields=["zone", "-observed_at"],
                        name="iot_note_zone_id_ab65db_idx",
                    ),
                ),
            ],
        ),
    ]
