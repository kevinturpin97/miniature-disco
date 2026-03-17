# State-only migration: slug field already has unique constraint in the DB.
# database_operations=[] ensures no DDL is executed.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="organization",
                    name="slug",
                    field=models.SlugField(max_length=100, unique=True),
                ),
            ],
        ),
    ]
