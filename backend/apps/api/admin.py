"""Django admin configuration for the API app.

All models have been moved to dedicated apps. Admin registrations are in:
- apps.organizations: Organization, Membership, Invitation
- apps.developer: APIKey, APIKeyLog, Webhook, WebhookDelivery
- apps.billing: Subscription
- apps.cloud: CloudTenant, ImpersonationToken
"""
