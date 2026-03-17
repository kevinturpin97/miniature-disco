# State-only migration: indexes already exist in the DB (created by apps.api migrations).
# database_operations=[] ensures no DDL is executed.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("developer", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameIndex(
                    model_name="apikeylog",
                    new_name="api_apikeyl_api_key_6935b0_idx",
                    old_name="api_apikeylog_api_key_created_at_idx",
                ),
            ],
        ),
    ]
