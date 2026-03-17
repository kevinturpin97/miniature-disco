"""Stub migration: remove all models from api app state (they moved to new apps).

NO database operations — tables remain unchanged. The new apps' migrations
create the corresponding model states using SeparateDatabaseAndState.
"""

from django.db import migrations


class Migration(migrations.Migration):
    """Remove api models from Django ORM state after they were moved to dedicated apps."""

    dependencies = [
        ("api", "0004_sprint28_cloud_tenant"),
        ("organizations", "0001_initial"),
        ("developer", "0001_initial"),
        ("billing", "0001_initial"),
        ("cloud", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],  # Never touch the DB
            state_operations=[
                migrations.DeleteModel("Organization"),
                migrations.DeleteModel("Membership"),
                migrations.DeleteModel("Invitation"),
                migrations.DeleteModel("APIKey"),
                migrations.DeleteModel("APIKeyLog"),
                migrations.DeleteModel("Webhook"),
                migrations.DeleteModel("WebhookDelivery"),
                migrations.DeleteModel("Subscription"),
                migrations.DeleteModel("CloudTenant"),
                migrations.DeleteModel("ImpersonationToken"),
            ],
        ),
    ]
