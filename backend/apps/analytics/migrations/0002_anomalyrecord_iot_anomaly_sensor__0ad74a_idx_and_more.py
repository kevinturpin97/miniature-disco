# State-only migration: indexes already exist in the DB (created by apps.iot migrations).
# database_operations=[] ensures no DDL is executed.

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("analytics", "0001_initial"),
        ("greenhouse", "0002_sensorreading_iot_sensorr_sensor__3b51ef_idx_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name="anomalyrecord",
                    index=models.Index(
                        fields=["sensor", "-detected_at"],
                        name="iot_anomaly_sensor__0ad74a_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="auditevent",
                    index=models.Index(
                        fields=["user", "-created_at"],
                        name="iot_auditev_user_id_b6ef55_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="auditevent",
                    index=models.Index(
                        fields=["resource_type", "resource_id"],
                        name="iot_auditev_resourc_d82051_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="auditevent",
                    index=models.Index(
                        fields=["action", "-created_at"],
                        name="iot_auditev_action_64b69c_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="auditevent",
                    index=models.Index(
                        fields=["cloud_synced", "-created_at"],
                        name="iot_auditev_cloud_s_424dd1_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="sensorprediction",
                    index=models.Index(
                        fields=["sensor", "predicted_at"],
                        name="iot_sensorp_sensor__805abc_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="sensorprediction",
                    index=models.Index(
                        fields=["sensor", "-generated_at"],
                        name="iot_sensorp_sensor__e0a1e0_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="sensorreadingdaily",
                    index=models.Index(
                        fields=["sensor", "-date"],
                        name="iot_sensorr_sensor__48f90b_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="sensorreadinghourly",
                    index=models.Index(
                        fields=["sensor", "-hour"],
                        name="iot_sensorr_sensor__c46c97_idx",
                    ),
                ),
            ],
        ),
    ]
