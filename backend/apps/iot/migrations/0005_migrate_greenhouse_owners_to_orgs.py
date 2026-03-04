"""Data migration: create personal organizations for existing greenhouse owners."""

from django.db import migrations
from django.utils.text import slugify


def migrate_owners_to_orgs(apps, schema_editor):
    """For each user who owns greenhouses, create a personal org and link."""
    Greenhouse = apps.get_model("iot", "Greenhouse")
    Organization = apps.get_model("api", "Organization")
    Membership = apps.get_model("api", "Membership")

    owner_ids = (
        Greenhouse.objects.filter(organization__isnull=True)
        .values_list("owner_id", flat=True)
        .distinct()
    )
    User = apps.get_model("auth", "User")

    for user_id in owner_ids:
        if user_id is None:
            continue
        user = User.objects.get(pk=user_id)
        base_slug = slugify(user.username) or f"user-{user.pk}"
        slug = base_slug
        counter = 1
        while Organization.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization.objects.create(
            name=f"{user.username}'s Organization",
            slug=slug,
            plan="FREE",
        )
        Membership.objects.create(
            user=user,
            organization=org,
            role="OWNER",
        )
        Greenhouse.objects.filter(owner=user, organization__isnull=True).update(
            organization=org,
        )


def reverse_migration(apps, schema_editor):
    """Reverse: clear organization field on greenhouses."""
    Greenhouse = apps.get_model("iot", "Greenhouse")
    Greenhouse.objects.all().update(organization=None)


class Migration(migrations.Migration):

    dependencies = [
        ("iot", "0004_add_organization_to_greenhouse"),
        ("api", "0001_create_organization_models"),
    ]

    operations = [
        migrations.RunPython(migrate_owners_to_orgs, reverse_migration),
    ]
