# State-only migration: indexes already exist in the DB (created by apps.iot migrations).
# database_operations=[] ensures no DDL is executed.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sites", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name="weatherdata",
                    index=models.Index(
                        fields=["site", "-timestamp"],
                        name="iot_weather_site_id_c6da97_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="weatherdata",
                    index=models.Index(
                        fields=["site", "is_forecast", "-timestamp"],
                        name="iot_weather_site_id_1b63fd_idx",
                    ),
                ),
            ],
        ),
    ]
