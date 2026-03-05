"""Celery tasks for billing operations (Sprint 22).

Tasks:
- check_trial_expiry: Daily check for organizations with expired trials.
- send_trial_expiry_reminder: Send email 3 days before trial expires.
- send_payment_confirmation_email: Notify org owner on successful payment.
- send_payment_failed_email: Notify org owner on failed payment.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


@shared_task(name="api.check_trial_expiry")
def check_trial_expiry() -> int:
    """Check for organizations whose trial has expired and send reminders.

    - Sends a reminder email 3 days before trial expires.
    - Logs organizations whose trial has expired.

    Returns:
        Number of organizations notified.
    """
    from apps.api.models import Membership, Organization

    now = timezone.now()
    reminder_window_start = now + timezone.timedelta(days=2)
    reminder_window_end = now + timezone.timedelta(days=4)

    # Organizations with trial ending in ~3 days that are still on FREE
    orgs_to_remind = Organization.objects.filter(
        plan=Organization.Plan.FREE,
        trial_ends_at__gte=reminder_window_start,
        trial_ends_at__lte=reminder_window_end,
    )

    count = 0
    for org in orgs_to_remind:
        owner = Membership.objects.filter(
            organization=org, role=Membership.Role.OWNER
        ).select_related("user").first()
        if not owner:
            continue

        send_trial_expiry_reminder.delay(org.pk, owner.user.email, owner.user.username)
        count += 1

    # Log expired trials
    expired = Organization.objects.filter(
        plan=Organization.Plan.FREE,
        trial_ends_at__lt=now,
        trial_ends_at__isnull=False,
    ).count()
    if expired:
        logger.info("%d organizations have expired trials", expired)

    return count


@shared_task(name="api.send_trial_expiry_reminder")
def send_trial_expiry_reminder(org_id: int, email: str, username: str) -> None:
    """Send an email reminding the user that their trial is about to expire.

    Args:
        org_id: Organization primary key.
        email: Recipient email address.
        username: Recipient username for personalization.
    """
    from apps.api.models import Organization

    try:
        org = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        return

    days_left = (org.trial_ends_at - timezone.now()).days if org.trial_ends_at else 0

    html_message = render_to_string("billing/trial_expiry_reminder.html", {
        "username": username,
        "org_name": org.name,
        "days_left": max(days_left, 0),
        "trial_ends_at": org.trial_ends_at,
        "upgrade_url": f"{settings.FRONTEND_URL}/billing",
    })

    send_mail(
        subject=f"Your Greenhouse SaaS trial expires in {days_left} days",
        message=strip_tags(html_message),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        html_message=html_message,
        fail_silently=True,
    )
    logger.info("Trial expiry reminder sent to %s for org %s", email, org.slug)


@shared_task(name="api.send_payment_confirmation_email")
def send_payment_confirmation_email(org_id: int, plan: str) -> None:
    """Send a payment confirmation email to the organization owner.

    Args:
        org_id: Organization primary key.
        plan: The plan the organization upgraded to.
    """
    from apps.api.models import Membership, Organization

    try:
        org = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        return

    owner = Membership.objects.filter(
        organization=org, role=Membership.Role.OWNER
    ).select_related("user").first()
    if not owner:
        return

    html_message = render_to_string("billing/payment_confirmation.html", {
        "username": owner.user.username,
        "org_name": org.name,
        "plan": plan,
        "billing_url": f"{settings.FRONTEND_URL}/billing",
    })

    send_mail(
        subject=f"Payment confirmed — {org.name} upgraded to {plan}",
        message=strip_tags(html_message),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[owner.user.email],
        html_message=html_message,
        fail_silently=True,
    )
    logger.info("Payment confirmation sent to %s for org %s", owner.user.email, org.slug)


@shared_task(name="api.send_payment_failed_email")
def send_payment_failed_email(org_id: int) -> None:
    """Send a payment failure notification to the organization owner.

    Args:
        org_id: Organization primary key.
    """
    from apps.api.models import Membership, Organization

    try:
        org = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        return

    owner = Membership.objects.filter(
        organization=org, role=Membership.Role.OWNER
    ).select_related("user").first()
    if not owner:
        return

    html_message = render_to_string("billing/payment_failed.html", {
        "username": owner.user.username,
        "org_name": org.name,
        "billing_url": f"{settings.FRONTEND_URL}/billing",
    })

    send_mail(
        subject=f"Payment failed — {org.name}",
        message=strip_tags(html_message),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[owner.user.email],
        html_message=html_message,
        fail_silently=True,
    )
    logger.info("Payment failed notification sent to %s for org %s", owner.user.email, org.slug)
