"""Stripe billing integration for the Greenhouse SaaS platform.

Provides helpers for:
- Creating Stripe customers
- Creating Checkout Sessions for upgrades
- Creating a Customer Portal session
- Processing webhook events
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone as tz

import stripe
from django.conf import settings
from django.utils import timezone

from .models import Organization, Subscription

logger = logging.getLogger(__name__)

# Map our plan names to Stripe price IDs (configured via settings/env).
PLAN_PRICE_MAP: dict[str, str] = {
    Organization.Plan.PRO: "STRIPE_PRICE_PRO",
    Organization.Plan.ENTERPRISE: "STRIPE_PRICE_ENTERPRISE",
}


def _get_stripe():
    """Return a configured stripe module (lazy init)."""
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def get_or_create_stripe_customer(org: Organization) -> str:
    """Ensure the organization has a Stripe customer ID and return it.

    Args:
        org: The organization to look up or create a customer for.

    Returns:
        The Stripe customer ID string.
    """
    if org.stripe_customer_id:
        return org.stripe_customer_id

    s = _get_stripe()
    owner_membership = org.memberships.filter(role="OWNER").select_related("user").first()
    email = owner_membership.user.email if owner_membership else ""

    customer = s.Customer.create(
        name=org.name,
        email=email,
        metadata={"org_id": str(org.pk), "org_slug": org.slug},
    )
    org.stripe_customer_id = customer.id
    org.save(update_fields=["stripe_customer_id"])
    return customer.id


def create_checkout_session(org: Organization, plan: str, success_url: str, cancel_url: str) -> str:
    """Create a Stripe Checkout Session for upgrading an organization.

    Args:
        org: The organization upgrading.
        plan: Target plan ("PRO" or "ENTERPRISE").
        success_url: URL to redirect to on success.
        cancel_url: URL to redirect to on cancel.

    Returns:
        The Checkout Session URL.

    Raises:
        ValueError: If the plan is invalid or price ID is not configured.
    """
    settings_key = PLAN_PRICE_MAP.get(plan)
    if not settings_key:
        raise ValueError(f"Invalid plan: {plan}")
    price_id = getattr(settings, settings_key, "")
    if not price_id:
        raise ValueError(f"Stripe price ID not configured for plan {plan}")

    s = _get_stripe()
    customer_id = get_or_create_stripe_customer(org)

    session = s.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"org_id": str(org.pk), "plan": plan},
        subscription_data={"metadata": {"org_id": str(org.pk), "plan": plan}},
    )
    return session.url


def create_customer_portal_session(org: Organization, return_url: str) -> str:
    """Create a Stripe Customer Portal session for managing the subscription.

    Args:
        org: The organization.
        return_url: URL to redirect back to after the portal.

    Returns:
        The portal session URL.
    """
    s = _get_stripe()
    customer_id = get_or_create_stripe_customer(org)
    session = s.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def _ts_to_dt(ts: int | None) -> datetime | None:
    """Convert a Unix timestamp to a timezone-aware datetime."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=tz.utc)


def handle_checkout_completed(session: dict) -> None:
    """Process a checkout.session.completed webhook event.

    Args:
        session: The Stripe session object data.
    """
    org_id = session.get("metadata", {}).get("org_id")
    if not org_id:
        logger.warning("checkout.session.completed missing org_id metadata")
        return

    try:
        org = Organization.objects.get(pk=int(org_id))
    except Organization.DoesNotExist:
        logger.error("checkout.session.completed: org %s not found", org_id)
        return

    subscription_id = session.get("subscription")
    if not subscription_id:
        return

    s = _get_stripe()
    stripe_sub = s.Subscription.retrieve(subscription_id)
    plan = stripe_sub.metadata.get("plan", Organization.Plan.PRO)

    Subscription.objects.update_or_create(
        organization=org,
        defaults={
            "stripe_subscription_id": stripe_sub.id,
            "stripe_price_id": stripe_sub["items"]["data"][0]["price"]["id"] if stripe_sub["items"]["data"] else "",
            "plan": plan,
            "status": Subscription.Status.ACTIVE,
            "current_period_start": _ts_to_dt(stripe_sub.current_period_start),
            "current_period_end": _ts_to_dt(stripe_sub.current_period_end),
            "cancel_at_period_end": stripe_sub.cancel_at_period_end,
        },
    )

    org.plan = plan
    org.trial_ends_at = None  # Clear trial on paid upgrade
    org.save(update_fields=["plan", "trial_ends_at"])
    logger.info("Organization %s upgraded to %s", org.slug, plan)

    # Send payment confirmation email asynchronously
    from .billing_tasks import send_payment_confirmation_email
    send_payment_confirmation_email.delay(org.pk, plan)


def handle_invoice_paid(invoice: dict) -> None:
    """Process an invoice.paid webhook event.

    Args:
        invoice: The Stripe invoice object data.
    """
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    try:
        sub = Subscription.objects.get(stripe_subscription_id=subscription_id)
    except Subscription.DoesNotExist:
        return

    sub.status = Subscription.Status.ACTIVE
    sub.save(update_fields=["status", "updated_at"])
    logger.info("Subscription %s marked active (invoice paid)", subscription_id)


def handle_invoice_payment_failed(invoice: dict) -> None:
    """Process an invoice.payment_failed webhook event.

    Args:
        invoice: The Stripe invoice object data.
    """
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    try:
        sub = Subscription.objects.get(stripe_subscription_id=subscription_id)
    except Subscription.DoesNotExist:
        return

    sub.status = Subscription.Status.PAST_DUE
    sub.save(update_fields=["status", "updated_at"])
    logger.warning("Subscription %s is past due (payment failed)", subscription_id)

    # Send payment failed email asynchronously
    from .billing_tasks import send_payment_failed_email
    send_payment_failed_email.delay(sub.organization_id)


def handle_subscription_updated(stripe_sub: dict) -> None:
    """Process a customer.subscription.updated webhook event.

    Args:
        stripe_sub: The Stripe subscription object data.
    """
    try:
        sub = Subscription.objects.get(stripe_subscription_id=stripe_sub["id"])
    except Subscription.DoesNotExist:
        return

    status_map = {
        "active": Subscription.Status.ACTIVE,
        "past_due": Subscription.Status.PAST_DUE,
        "canceled": Subscription.Status.CANCELED,
        "incomplete": Subscription.Status.INCOMPLETE,
        "trialing": Subscription.Status.TRIALING,
    }
    sub.status = status_map.get(stripe_sub.get("status", ""), sub.status)
    sub.current_period_start = _ts_to_dt(stripe_sub.get("current_period_start"))
    sub.current_period_end = _ts_to_dt(stripe_sub.get("current_period_end"))
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)
    if stripe_sub.get("canceled_at"):
        sub.canceled_at = _ts_to_dt(stripe_sub["canceled_at"])
    sub.save()


def handle_subscription_deleted(stripe_sub: dict) -> None:
    """Process a customer.subscription.deleted webhook event.

    Downgrades the organization back to FREE and cancels the subscription.

    Args:
        stripe_sub: The Stripe subscription object data.
    """
    try:
        sub = Subscription.objects.get(stripe_subscription_id=stripe_sub["id"])
    except Subscription.DoesNotExist:
        return

    sub.status = Subscription.Status.CANCELED
    sub.canceled_at = timezone.now()
    sub.save(update_fields=["status", "canceled_at", "updated_at"])

    org = sub.organization
    org.plan = Organization.Plan.FREE
    org.save(update_fields=["plan"])
    logger.info("Organization %s downgraded to FREE (subscription canceled)", org.slug)
