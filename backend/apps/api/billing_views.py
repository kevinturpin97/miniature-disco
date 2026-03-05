"""Billing views for the Greenhouse SaaS API (Sprint 22).

Provides:
- BillingOverviewView: current plan, usage, and subscription details
- CreateCheckoutSessionView: start a Stripe Checkout for upgrade
- CustomerPortalView: link to Stripe Customer Portal
- StripeWebhookView: handle inbound Stripe webhook events
"""

import logging

import stripe
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Membership, Organization, Subscription
from .serializers import BillingOverviewSerializer
from .stripe_billing import (
    create_checkout_session,
    create_customer_portal_session,
    handle_checkout_completed,
    handle_invoice_paid,
    handle_invoice_payment_failed,
    handle_subscription_deleted,
    handle_subscription_updated,
)

logger = logging.getLogger(__name__)


def _get_org_as_admin(request: Request, slug: str) -> Organization:
    """Resolve organization from slug and verify the user is ADMIN+.

    Args:
        request: The current DRF request.
        slug: The organization slug from the URL.

    Returns:
        The Organization instance.

    Raises:
        PermissionDenied: If the user is not ADMIN+ in the organization.
    """
    org = get_object_or_404(
        Organization,
        slug=slug,
        memberships__user=request.user,
    )
    membership = Membership.objects.filter(user=request.user, organization=org).first()
    if not membership or membership.role_level < Membership.ROLE_HIERARCHY[Membership.Role.ADMIN]:
        raise PermissionDenied("Only admins can manage billing.")
    return org


class BillingOverviewView(APIView):
    """Return billing overview for an organization.

    GET /api/orgs/{slug}/billing/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, slug: str) -> Response:
        org = _get_org_as_admin(request, slug)

        subscription = None
        try:
            subscription = org.subscription
        except Subscription.DoesNotExist:
            pass

        zone_count = sum(gh.zones.count() for gh in org.greenhouses.all())

        data = {
            "plan": org.plan,
            "is_on_trial": org.is_on_trial,
            "trial_ends_at": org.trial_ends_at,
            "trial_expired": org.trial_expired,
            "subscription": subscription,
            "usage": {
                "greenhouses": org.greenhouses.count(),
                "max_greenhouses": org.max_greenhouses,
                "zones": zone_count,
                "max_zones": org.max_zones,
                "members": org.memberships.count(),
                "max_members": org.max_members,
            },
            "stripe_publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        }
        serializer = BillingOverviewSerializer(data)
        return Response(serializer.data)


class CreateCheckoutSessionView(APIView):
    """Create a Stripe Checkout Session for plan upgrade.

    POST /api/orgs/{slug}/billing/checkout/
    Body: { "plan": "PRO" | "ENTERPRISE" }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, slug: str) -> Response:
        org = _get_org_as_admin(request, slug)
        plan = request.data.get("plan")

        if plan not in (Organization.Plan.PRO, Organization.Plan.ENTERPRISE):
            return Response(
                {"detail": "Invalid plan. Choose PRO or ENTERPRISE."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if org.plan == plan:
            return Response(
                {"detail": f"Organization is already on the {plan} plan."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        frontend_url = settings.FRONTEND_URL
        success_url = f"{frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}&success=true"
        cancel_url = f"{frontend_url}/billing?canceled=true"

        try:
            checkout_url = create_checkout_session(org, plan, success_url, cancel_url)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"checkout_url": checkout_url})


class CustomerPortalView(APIView):
    """Create a Stripe Customer Portal session.

    POST /api/orgs/{slug}/billing/portal/
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, slug: str) -> Response:
        org = _get_org_as_admin(request, slug)

        if not org.stripe_customer_id:
            return Response(
                {"detail": "No billing account found. Upgrade first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        frontend_url = settings.FRONTEND_URL
        return_url = f"{frontend_url}/billing"

        portal_url = create_customer_portal_session(org, return_url)
        return Response({"portal_url": portal_url})


class StripeWebhookView(APIView):
    """Handle incoming Stripe webhook events.

    POST /api/webhooks/stripe/

    Verifies the webhook signature and dispatches to the appropriate handler.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request: Request) -> Response:
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        webhook_secret = settings.STRIPE_WEBHOOK_SECRET

        if not webhook_secret:
            logger.error("STRIPE_WEBHOOK_SECRET not configured")
            return Response(
                {"detail": "Webhook secret not configured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except ValueError:
            logger.warning("Invalid Stripe webhook payload")
            return Response({"detail": "Invalid payload."}, status=status.HTTP_400_BAD_REQUEST)
        except stripe.error.SignatureVerificationError:
            logger.warning("Invalid Stripe webhook signature")
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        event_type = event["type"]
        data = event["data"]["object"]

        handlers = {
            "checkout.session.completed": handle_checkout_completed,
            "invoice.paid": handle_invoice_paid,
            "invoice.payment_failed": handle_invoice_payment_failed,
            "customer.subscription.updated": handle_subscription_updated,
            "customer.subscription.deleted": handle_subscription_deleted,
        }

        handler = handlers.get(event_type)
        if handler:
            try:
                handler(data)
            except Exception:
                logger.exception("Error handling Stripe event %s", event_type)
                return Response(
                    {"detail": "Webhook handler error."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        else:
            logger.debug("Unhandled Stripe event type: %s", event_type)

        return Response({"status": "ok"})
