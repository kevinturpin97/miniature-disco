"""Tests for billing endpoints, Stripe webhook handling, quota enforcement, and trial logic."""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from apps.api.models import Membership, Organization, Subscription
from conftest import MembershipFactory, OrganizationFactory, UserFactory


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def billing_org(db):
    """Organization with OWNER membership for billing tests."""
    user = UserFactory()
    org = OrganizationFactory(
        name="Billing Org",
        slug="billing-org",
        plan=Organization.Plan.FREE,
        trial_ends_at=timezone.now() + timedelta(days=14),
    )
    MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)
    return org, user


@pytest.fixture
def billing_auth_client(billing_org):
    """Authenticated API client for billing org owner."""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    org, user = billing_org
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client, org, user


@pytest.fixture
def pro_org(db):
    """Organization on PRO plan with a subscription."""
    user = UserFactory()
    org = OrganizationFactory(
        name="Pro Org",
        slug="pro-org",
        plan=Organization.Plan.PRO,
        stripe_customer_id="cus_test123",
    )
    MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)
    sub = Subscription.objects.create(
        organization=org,
        stripe_subscription_id="sub_test123",
        stripe_price_id="price_pro",
        plan=Organization.Plan.PRO,
        status=Subscription.Status.ACTIVE,
        current_period_start=timezone.now(),
        current_period_end=timezone.now() + timedelta(days=30),
    )
    return org, user, sub


def _make_auth_client(user):
    """Helper to create an authenticated APIClient."""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


# ---------------------------------------------------------------------------
# Organization trial properties
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOrganizationTrialProperties:
    """Test trial-related properties on Organization model."""

    def test_is_on_trial_active(self, billing_org):
        org, _ = billing_org
        assert org.is_on_trial is True

    def test_is_on_trial_expired(self, db):
        org = OrganizationFactory(
            trial_ends_at=timezone.now() - timedelta(days=1),
        )
        assert org.is_on_trial is False

    def test_is_on_trial_no_trial(self, db):
        org = OrganizationFactory(trial_ends_at=None)
        assert org.is_on_trial is False

    def test_trial_expired_flag(self, db):
        org = OrganizationFactory(
            plan=Organization.Plan.FREE,
            trial_ends_at=timezone.now() - timedelta(days=1),
        )
        assert org.trial_expired is True

    def test_trial_not_expired_when_upgraded(self, db):
        org = OrganizationFactory(
            plan=Organization.Plan.PRO,
            trial_ends_at=timezone.now() - timedelta(days=1),
        )
        assert org.trial_expired is False

    def test_effective_plan_during_trial(self, billing_org):
        org, _ = billing_org
        assert org.effective_plan == Organization.Plan.PRO
        assert org.effective_max_greenhouses == 10
        assert org.effective_max_zones == 50

    def test_effective_plan_after_trial(self, db):
        org = OrganizationFactory(
            plan=Organization.Plan.FREE,
            trial_ends_at=timezone.now() - timedelta(days=1),
        )
        assert org.effective_plan == Organization.Plan.FREE
        assert org.effective_max_greenhouses == 3
        assert org.effective_max_zones == 9

    def test_effective_plan_paid(self, pro_org):
        org, _, _ = pro_org
        assert org.effective_plan == Organization.Plan.PRO

    def test_max_members_property(self, billing_org):
        org, _ = billing_org
        assert org.max_members == 3  # FREE plan


# ---------------------------------------------------------------------------
# 14-day trial on registration
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTrialOnRegistration:
    """Verify that registering a new user creates an org with a 14-day trial."""

    url = "/api/auth/register/"

    def test_register_creates_trial(self, api_client):
        payload = {
            "username": "trialuser",
            "email": "trial@example.com",
            "password": "StrongPass123!",
            "password2": "StrongPass123!",
        }
        response = api_client.post(self.url, payload)
        assert response.status_code == 201

        org = Organization.objects.filter(memberships__user__username="trialuser").first()
        assert org is not None
        assert org.trial_ends_at is not None
        assert org.is_on_trial is True
        delta = org.trial_ends_at - timezone.now()
        assert 13 <= delta.days <= 14


# ---------------------------------------------------------------------------
# Billing overview endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestBillingOverview:
    """GET /api/orgs/{slug}/billing/"""

    def test_billing_overview_success(self, billing_auth_client):
        client, org, _ = billing_auth_client
        response = client.get(f"/api/orgs/{org.slug}/billing/")
        assert response.status_code == 200
        data = response.data
        assert data["plan"] == "FREE"
        assert data["is_on_trial"] is True
        assert data["usage"]["greenhouses"] == 0
        assert data["usage"]["max_greenhouses"] == 3
        assert "stripe_publishable_key" in data

    def test_billing_overview_with_subscription(self, pro_org):
        org, user, sub = pro_org
        client = _make_auth_client(user)
        response = client.get(f"/api/orgs/{org.slug}/billing/")
        assert response.status_code == 200
        assert response.data["plan"] == "PRO"
        assert response.data["subscription"]["plan"] == "PRO"
        assert response.data["subscription"]["status"] == "ACTIVE"

    def test_billing_overview_requires_admin_role(self, billing_org):
        """VIEWER cannot access billing."""
        org, _ = billing_org
        viewer = UserFactory()
        MembershipFactory(user=viewer, organization=org, role=Membership.Role.VIEWER)
        client = _make_auth_client(viewer)
        response = client.get(f"/api/orgs/{org.slug}/billing/")
        assert response.status_code == 403

    def test_billing_overview_unauthenticated(self, api_client, billing_org):
        org, _ = billing_org
        response = api_client.get(f"/api/orgs/{org.slug}/billing/")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Checkout session
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCreateCheckoutSession:
    """POST /api/orgs/{slug}/billing/checkout/"""

    @patch("apps.api.billing_views.create_checkout_session")
    def test_checkout_success(self, mock_checkout, billing_auth_client):
        mock_checkout.return_value = "https://checkout.stripe.com/test"
        client, org, _ = billing_auth_client
        response = client.post(
            f"/api/orgs/{org.slug}/billing/checkout/",
            {"plan": "PRO"},
        )
        assert response.status_code == 200
        assert response.data["checkout_url"] == "https://checkout.stripe.com/test"
        mock_checkout.assert_called_once()

    def test_checkout_invalid_plan(self, billing_auth_client):
        client, org, _ = billing_auth_client
        response = client.post(
            f"/api/orgs/{org.slug}/billing/checkout/",
            {"plan": "INVALID"},
        )
        assert response.status_code == 400

    def test_checkout_same_plan(self, pro_org):
        org, user, _ = pro_org
        client = _make_auth_client(user)
        response = client.post(
            f"/api/orgs/{org.slug}/billing/checkout/",
            {"plan": "PRO"},
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Customer portal
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCustomerPortal:
    """POST /api/orgs/{slug}/billing/portal/"""

    @patch("apps.api.billing_views.create_customer_portal_session")
    def test_portal_success(self, mock_portal, pro_org):
        mock_portal.return_value = "https://billing.stripe.com/test"
        org, user, _ = pro_org
        client = _make_auth_client(user)
        response = client.post(f"/api/orgs/{org.slug}/billing/portal/")
        assert response.status_code == 200
        assert response.data["portal_url"] == "https://billing.stripe.com/test"

    def test_portal_no_billing_account(self, billing_auth_client):
        client, org, _ = billing_auth_client
        response = client.post(f"/api/orgs/{org.slug}/billing/portal/")
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Stripe Webhook handling
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStripeWebhook:
    """POST /api/webhooks/stripe/"""

    url = "/api/webhooks/stripe/"

    @pytest.fixture(autouse=True)
    def _set_webhook_secret(self, settings):
        settings.STRIPE_WEBHOOK_SECRET = "whsec_test_secret"

    def _build_event(self, event_type: str, data: dict) -> dict:
        return {
            "id": "evt_test",
            "type": event_type,
            "data": {"object": data},
        }

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_checkout_completed_webhook(self, mock_construct, billing_org, api_client):
        org, user = billing_org

        stripe_sub_mock = MagicMock()
        stripe_sub_mock.id = "sub_new"
        stripe_sub_mock.metadata = {"plan": "PRO"}
        stripe_sub_mock.current_period_start = 1704067200
        stripe_sub_mock.current_period_end = 1706745600
        stripe_sub_mock.cancel_at_period_end = False
        stripe_sub_mock.__getitem__ = lambda self, key: {
            "items": {"data": [{"price": {"id": "price_pro"}}]},
        }[key] if key == "items" else getattr(self, key)

        event = self._build_event("checkout.session.completed", {
            "metadata": {"org_id": str(org.pk)},
            "subscription": "sub_new",
        })
        mock_construct.return_value = event

        with patch("apps.api.stripe_billing._get_stripe") as mock_stripe:
            mock_stripe_mod = MagicMock()
            mock_stripe_mod.Subscription.retrieve.return_value = stripe_sub_mock
            mock_stripe.return_value = mock_stripe_mod
            with patch("apps.api.billing_tasks.send_payment_confirmation_email.delay"):
                response = api_client.post(
                    self.url,
                    data=b"raw_payload",
                    content_type="application/json",
                    HTTP_STRIPE_SIGNATURE="test_sig",
                )

        assert response.status_code == 200
        org.refresh_from_db()
        assert org.plan == Organization.Plan.PRO
        assert org.trial_ends_at is None
        assert Subscription.objects.filter(organization=org).exists()

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_invoice_payment_failed_webhook(self, mock_construct, pro_org, api_client):
        org, user, sub = pro_org
        event = self._build_event("invoice.payment_failed", {
            "subscription": sub.stripe_subscription_id,
        })
        mock_construct.return_value = event

        with patch("apps.api.billing_tasks.send_payment_failed_email.delay"):
            response = api_client.post(
                self.url,
                data=b"payload",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="test_sig",
            )

        assert response.status_code == 200
        sub.refresh_from_db()
        assert sub.status == Subscription.Status.PAST_DUE

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_subscription_deleted_webhook(self, mock_construct, pro_org, api_client):
        org, user, sub = pro_org
        event = self._build_event("customer.subscription.deleted", {
            "id": sub.stripe_subscription_id,
        })
        mock_construct.return_value = event

        response = api_client.post(
            self.url,
            data=b"payload",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="test_sig",
        )

        assert response.status_code == 200
        sub.refresh_from_db()
        assert sub.status == Subscription.Status.CANCELED
        org.refresh_from_db()
        assert org.plan == Organization.Plan.FREE

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_invoice_paid_webhook(self, mock_construct, pro_org, api_client):
        org, user, sub = pro_org
        sub.status = Subscription.Status.PAST_DUE
        sub.save()

        event = self._build_event("invoice.paid", {
            "subscription": sub.stripe_subscription_id,
        })
        mock_construct.return_value = event

        response = api_client.post(
            self.url,
            data=b"payload",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="test_sig",
        )

        assert response.status_code == 200
        sub.refresh_from_db()
        assert sub.status == Subscription.Status.ACTIVE

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_subscription_updated_webhook(self, mock_construct, pro_org, api_client):
        org, user, sub = pro_org
        event = self._build_event("customer.subscription.updated", {
            "id": sub.stripe_subscription_id,
            "status": "past_due",
            "current_period_start": 1704067200,
            "current_period_end": 1706745600,
            "cancel_at_period_end": True,
        })
        mock_construct.return_value = event

        response = api_client.post(
            self.url,
            data=b"payload",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="test_sig",
        )

        assert response.status_code == 200
        sub.refresh_from_db()
        assert sub.status == Subscription.Status.PAST_DUE
        assert sub.cancel_at_period_end is True

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_invalid_signature_rejected(self, mock_construct, api_client):
        import stripe as stripe_mod
        mock_construct.side_effect = stripe_mod.error.SignatureVerificationError("bad sig", "header")

        response = api_client.post(
            self.url,
            data=b"payload",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="bad_sig",
        )
        assert response.status_code == 400

    @patch("apps.api.billing_views.stripe.Webhook.construct_event")
    def test_unhandled_event_returns_ok(self, mock_construct, api_client):
        mock_construct.return_value = {
            "type": "some.unhandled.event",
            "data": {"object": {}},
        }
        response = api_client.post(
            self.url,
            data=b"payload",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="test",
        )
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Quota enforcement with trial
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestQuotaEnforcement:
    """Verify quota enforcement respects trial status."""

    def test_free_user_on_trial_gets_pro_limits(self, billing_auth_client):
        """During trial, FREE user should be able to create up to 10 greenhouses."""
        client, org, user = billing_auth_client
        assert org.effective_max_greenhouses == 10

        for i in range(3):
            response = client.post("/api/greenhouses/", {"name": f"GH {i}"})
            assert response.status_code == 201, response.data

    def test_expired_trial_reverts_to_free_limits(self, db):
        """After trial expires, limits revert to FREE."""
        org = OrganizationFactory(
            plan=Organization.Plan.FREE,
            trial_ends_at=timezone.now() - timedelta(days=1),
        )
        assert org.effective_max_greenhouses == 3
        assert org.effective_max_zones == 9


# ---------------------------------------------------------------------------
# Subscription model
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSubscriptionModel:
    """Test Subscription model properties."""

    def test_is_active_for_active_sub(self, pro_org):
        _, _, sub = pro_org
        assert sub.is_active is True

    def test_is_active_for_canceled_sub(self, pro_org):
        _, _, sub = pro_org
        sub.status = Subscription.Status.CANCELED
        sub.save()
        assert sub.is_active is False

    def test_str_representation(self, pro_org):
        _, _, sub = pro_org
        assert "Pro Org" in str(sub)
        assert "PRO" in str(sub)


# ---------------------------------------------------------------------------
# Trial expiry task
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTrialExpiryTask:
    """Test the check_trial_expiry Celery task."""

    @patch("apps.api.billing_tasks.send_trial_expiry_reminder.delay")
    def test_sends_reminders_for_expiring_trials(self, mock_send, db):
        from apps.api.billing_tasks import check_trial_expiry

        user = UserFactory()
        org = OrganizationFactory(
            plan=Organization.Plan.FREE,
            trial_ends_at=timezone.now() + timedelta(days=3),
        )
        MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)

        count = check_trial_expiry()
        assert count == 1
        mock_send.assert_called_once()

    @patch("apps.api.billing_tasks.send_trial_expiry_reminder.delay")
    def test_does_not_remind_already_expired(self, mock_send, db):
        from apps.api.billing_tasks import check_trial_expiry

        user = UserFactory()
        org = OrganizationFactory(
            plan=Organization.Plan.FREE,
            trial_ends_at=timezone.now() - timedelta(days=1),
        )
        MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)

        count = check_trial_expiry()
        assert count == 0
        mock_send.assert_not_called()

    @patch("apps.api.billing_tasks.send_trial_expiry_reminder.delay")
    def test_does_not_remind_paid_users(self, mock_send, db):
        from apps.api.billing_tasks import check_trial_expiry

        user = UserFactory()
        org = OrganizationFactory(
            plan=Organization.Plan.PRO,
            trial_ends_at=timezone.now() + timedelta(days=3),
        )
        MembershipFactory(user=user, organization=org, role=Membership.Role.OWNER)

        count = check_trial_expiry()
        assert count == 0


# ---------------------------------------------------------------------------
# Email tasks (smoke tests)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestBillingEmailTasks:
    """Verify email tasks run without errors."""

    @patch("apps.api.billing_tasks.send_mail")
    def test_trial_expiry_reminder_sends_email(self, mock_mail, billing_org):
        from apps.api.billing_tasks import send_trial_expiry_reminder
        org, user = billing_org
        send_trial_expiry_reminder(org.pk, user.email, user.username)
        mock_mail.assert_called_once()
        # send_mail uses keyword args
        call_kwargs = mock_mail.call_args
        subject = call_kwargs.kwargs.get("subject") or call_kwargs[0][0]
        assert "trial" in subject.lower()

    @patch("apps.api.billing_tasks.send_mail")
    def test_payment_confirmation_sends_email(self, mock_mail, billing_org):
        from apps.api.billing_tasks import send_payment_confirmation_email
        org, _ = billing_org
        # billing_org fixture already creates OWNER membership
        send_payment_confirmation_email(org.pk, "PRO")
        assert mock_mail.called

    @patch("apps.api.billing_tasks.send_mail")
    def test_payment_failed_sends_email(self, mock_mail, billing_org):
        from apps.api.billing_tasks import send_payment_failed_email
        org, _ = billing_org
        # billing_org fixture already creates OWNER membership
        send_payment_failed_email(org.pk)
        assert mock_mail.called
