"""Legacy stub — all models have been moved to dedicated apps.

Import directly from the appropriate app:

    from apps.organizations.models import Organization, Membership, Invitation
    from apps.developer.models import APIKey, APIKeyLog, Webhook, WebhookDelivery
    from apps.billing.models import Subscription
    from apps.cloud.models import CloudTenant, ImpersonationToken
"""

import secrets


def _generate_invite_token() -> str:
    """Generate a random invitation token.

    Kept here for backward compatibility with migration 0001_create_organization_models.py
    which references apps.api.models._generate_invite_token as the default callable.
    """
    return secrets.token_urlsafe(32)
