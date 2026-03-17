# State-only migration: slug field and indexes already exist in the DB (created by apps.iot migrations).
# database_operations=[] ensures no DDL is executed.

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("marketplace", "0001_initial"),
        ("organizations", "0002_alter_organization_slug"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="templatecategory",
                    name="slug",
                    field=models.SlugField(max_length=100, unique=True),
                ),
                migrations.AddIndex(
                    model_name="template",
                    index=models.Index(
                        fields=["-avg_rating", "-clone_count"],
                        name="iot_templat_avg_rat_5e4d56_idx",
                    ),
                ),
                migrations.AddIndex(
                    model_name="template",
                    index=models.Index(
                        fields=["category", "-avg_rating"],
                        name="iot_templat_categor_f0f567_idx",
                    ),
                ),
            ],
        ),
    ]
