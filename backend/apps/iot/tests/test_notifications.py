"""Tests for the notification system (Sprint 14).

Covers:
- NotificationChannel CRUD via API
- NotificationRule CRUD via API
- dispatch_notifications task (email, webhook, telegram)
- Rate limiting (cooldown)
- Daily digest task
- Permission checks (ADMIN+ required)
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Alert,
    Greenhouse,
    NotificationChannel,
    NotificationLog,
    NotificationRule,
    Sensor,
    SensorReading,
    Zone,
)
from apps.iot.tasks import dispatch_notifications, send_daily_digest

pytestmark = pytest.mark.django_db


@pytest.fixture
def org(user):
    """Return the user's organization."""
    return Membership.objects.filter(user=user, role=Membership.Role.OWNER).first().organization


@pytest.fixture
def viewer_user(db, org):
    """Create a viewer user in the same org."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.create_user(username="viewer", password="pass", email="viewer@test.fr")
    Membership.objects.create(user=u, organization=org, role=Membership.Role.VIEWER)
    return u


@pytest.fixture
def greenhouse(user, org):
    return Greenhouse.objects.create(name="GH1", organization=org, owner=user)


@pytest.fixture
def zone(greenhouse):
    return Zone.objects.create(greenhouse=greenhouse, name="Z1", relay_id=100, transmission_interval=300)


@pytest.fixture
def sensor(zone):
    return Sensor.objects.create(zone=zone, sensor_type="TEMP", unit="°C", min_threshold=10.0, max_threshold=35.0)


@pytest.fixture
def alert(zone, sensor):
    return Alert.objects.create(
        zone=zone,
        sensor=sensor,
        alert_type=Alert.AlertType.THRESHOLD_HIGH,
        severity=Alert.Severity.WARNING,
        value=36.5,
        message="Temperature in Z1 is 36.5 (above threshold 35.0)",
    )


@pytest.fixture
def email_channel(org):
    return NotificationChannel.objects.create(
        organization=org,
        channel_type=NotificationChannel.ChannelType.EMAIL,
        name="Email Alerts",
        email_recipients="admin@test.fr, ops@test.fr",
    )


@pytest.fixture
def webhook_channel(org):
    return NotificationChannel.objects.create(
        organization=org,
        channel_type=NotificationChannel.ChannelType.WEBHOOK,
        name="Webhook Alerts",
        webhook_url="https://hooks.example.com/greenhouse",
        webhook_secret="s3cret",
    )


@pytest.fixture
def telegram_channel(org):
    return NotificationChannel.objects.create(
        organization=org,
        channel_type=NotificationChannel.ChannelType.TELEGRAM,
        name="Telegram Alerts",
        telegram_bot_token="123456:ABC-DEF",
        telegram_chat_id="-100123456",
    )


@pytest.fixture
def email_rule(org, email_channel):
    return NotificationRule.objects.create(
        organization=org,
        name="Critical Email",
        channel=email_channel,
        alert_types=["HIGH", "LOW"],
        severities=["WARNING", "CRITICAL"],
        cooldown_seconds=300,
    )


@pytest.fixture
def authed_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def viewer_client(viewer_user):
    client = APIClient()
    client.force_authenticate(user=viewer_user)
    return client


# -------------------------------------------------------------------------
# Channel API Tests
# -------------------------------------------------------------------------

class TestNotificationChannelAPI:

    def test_list_channels(self, authed_client, org, email_channel):
        resp = authed_client.get(f"/api/orgs/{org.slug}/notifications/channels/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["name"] == "Email Alerts"

    def test_create_email_channel(self, authed_client, org):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/channels/",
            {"channel_type": "EMAIL", "name": "New Email", "email_recipients": "test@test.fr"},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["channel_type"] == "EMAIL"
        assert resp.data["organization"] == org.pk

    def test_create_webhook_channel(self, authed_client, org):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/channels/",
            {"channel_type": "WEBHOOK", "name": "My Hook", "webhook_url": "https://example.com/hook"},
            format="json",
        )
        assert resp.status_code == 201

    def test_create_telegram_channel(self, authed_client, org):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/channels/",
            {
                "channel_type": "TELEGRAM",
                "name": "TG",
                "telegram_bot_token": "123:ABC",
                "telegram_chat_id": "-100",
            },
            format="json",
        )
        assert resp.status_code == 201

    def test_create_email_missing_recipients(self, authed_client, org):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/channels/",
            {"channel_type": "EMAIL", "name": "Bad Email"},
            format="json",
        )
        assert resp.status_code == 400

    def test_create_webhook_missing_url(self, authed_client, org):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/channels/",
            {"channel_type": "WEBHOOK", "name": "Bad Hook"},
            format="json",
        )
        assert resp.status_code == 400

    def test_update_channel(self, authed_client, org, email_channel):
        resp = authed_client.patch(
            f"/api/orgs/{org.slug}/notifications/channels/{email_channel.pk}/",
            {"name": "Updated Name"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Updated Name"

    def test_delete_channel(self, authed_client, org, email_channel):
        resp = authed_client.delete(f"/api/orgs/{org.slug}/notifications/channels/{email_channel.pk}/")
        assert resp.status_code == 204

    def test_viewer_cannot_create_channel(self, viewer_client, org):
        resp = viewer_client.post(
            f"/api/orgs/{org.slug}/notifications/channels/",
            {"channel_type": "EMAIL", "name": "Nope", "email_recipients": "x@x.com"},
            format="json",
        )
        assert resp.status_code == 403

    def test_secrets_not_exposed(self, authed_client, org, webhook_channel):
        resp = authed_client.get(f"/api/orgs/{org.slug}/notifications/channels/{webhook_channel.pk}/")
        assert resp.status_code == 200
        assert "webhook_secret" not in resp.data
        assert resp.data["has_webhook_secret"] is True


# -------------------------------------------------------------------------
# Rule API Tests
# -------------------------------------------------------------------------

class TestNotificationRuleAPI:

    def test_list_rules(self, authed_client, org, email_rule):
        resp = authed_client.get(f"/api/orgs/{org.slug}/notifications/rules/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1

    def test_create_rule(self, authed_client, org, email_channel):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/rules/",
            {
                "name": "All Alerts",
                "channel": email_channel.pk,
                "alert_types": [],
                "severities": ["CRITICAL"],
                "cooldown_seconds": 600,
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "All Alerts"
        assert resp.data["organization"] == org.pk

    def test_invalid_alert_type(self, authed_client, org, email_channel):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/rules/",
            {
                "name": "Bad",
                "channel": email_channel.pk,
                "alert_types": ["INVALID"],
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_invalid_severity(self, authed_client, org, email_channel):
        resp = authed_client.post(
            f"/api/orgs/{org.slug}/notifications/rules/",
            {
                "name": "Bad",
                "channel": email_channel.pk,
                "severities": ["EXTREME"],
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_viewer_cannot_create_rule(self, viewer_client, org, email_channel):
        resp = viewer_client.post(
            f"/api/orgs/{org.slug}/notifications/rules/",
            {"name": "Nope", "channel": email_channel.pk},
            format="json",
        )
        assert resp.status_code == 403

    def test_delete_rule(self, authed_client, org, email_rule):
        resp = authed_client.delete(f"/api/orgs/{org.slug}/notifications/rules/{email_rule.pk}/")
        assert resp.status_code == 204


# -------------------------------------------------------------------------
# Dispatch Task Tests
# -------------------------------------------------------------------------

class TestDispatchNotifications:

    @patch("apps.iot.notification_dispatchers.send_mail")
    def test_dispatch_email(self, mock_send_mail, alert, email_rule):
        result = dispatch_notifications(alert.pk)
        assert result["sent"] == 1
        assert result["failed"] == 0
        mock_send_mail.assert_called_once()
        assert NotificationLog.objects.filter(status="SENT").count() == 1

    @patch("apps.iot.notification_dispatchers.urlopen")
    def test_dispatch_webhook(self, mock_urlopen, alert, org, webhook_channel):
        NotificationRule.objects.create(
            organization=org,
            name="Webhook Rule",
            channel=webhook_channel,
            alert_types=["HIGH"],
            severities=["WARNING"],
            cooldown_seconds=300,
        )
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        result = dispatch_notifications(alert.pk)
        assert result["sent"] == 1
        mock_urlopen.assert_called_once()

        # Verify HMAC signature was included
        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        assert "X-greenhouse-signature" in req.headers or "X-Greenhouse-Signature" in req.headers

    @patch("apps.iot.notification_dispatchers.urlopen")
    def test_dispatch_telegram(self, mock_urlopen, alert, org, telegram_channel):
        NotificationRule.objects.create(
            organization=org,
            name="TG Rule",
            channel=telegram_channel,
            alert_types=[],
            severities=[],
            cooldown_seconds=300,
        )
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        result = dispatch_notifications(alert.pk)
        assert result["sent"] == 1

    @patch("apps.iot.notification_dispatchers.send_mail")
    def test_cooldown_prevents_duplicate(self, mock_send_mail, alert, email_rule):
        # First dispatch
        dispatch_notifications(alert.pk)
        assert mock_send_mail.call_count == 1

        # Create a second alert
        alert2 = Alert.objects.create(
            zone=alert.zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
            severity=Alert.Severity.WARNING,
            value=37.0,
            message="Another threshold breach",
        )

        # Second dispatch within cooldown window
        result = dispatch_notifications(alert2.pk)
        assert result["sent"] == 0
        assert mock_send_mail.call_count == 1  # not called again

    @patch("apps.iot.notification_dispatchers.send_mail")
    def test_cooldown_expired_allows_send(self, mock_send_mail, alert, email_rule):
        # First dispatch
        dispatch_notifications(alert.pk)

        # Move last_notified to the past
        email_rule.refresh_from_db()
        email_rule.last_notified = timezone.now() - timedelta(seconds=600)
        email_rule.save(update_fields=["last_notified"])

        alert2 = Alert.objects.create(
            zone=alert.zone,
            alert_type=Alert.AlertType.THRESHOLD_LOW,
            severity=Alert.Severity.WARNING,
            value=5.0,
            message="Below threshold",
        )
        result = dispatch_notifications(alert2.pk)
        assert result["sent"] == 1
        assert mock_send_mail.call_count == 2

    @patch("apps.iot.notification_dispatchers.send_mail")
    def test_alert_type_filter(self, mock_send_mail, zone, sensor, email_rule):
        # Rule only matches HIGH and LOW — create an OFFLINE alert
        offline_alert = Alert.objects.create(
            zone=zone,
            alert_type=Alert.AlertType.RELAY_OFFLINE,
            severity=Alert.Severity.CRITICAL,
            message="Relay offline",
        )
        result = dispatch_notifications(offline_alert.pk)
        assert result["sent"] == 0
        mock_send_mail.assert_not_called()

    @patch("apps.iot.notification_dispatchers.send_mail")
    def test_severity_filter(self, mock_send_mail, zone, sensor, org, email_channel):
        # Rule only matches CRITICAL
        NotificationRule.objects.create(
            organization=org,
            name="Critical Only",
            channel=email_channel,
            alert_types=[],
            severities=["CRITICAL"],
            cooldown_seconds=300,
        )
        info_alert = Alert.objects.create(
            zone=zone,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
            severity=Alert.Severity.INFO,
            value=30.0,
            message="Info alert",
        )
        result = dispatch_notifications(info_alert.pk)
        assert result["sent"] == 0

    @patch("apps.iot.notification_dispatchers.send_mail", side_effect=Exception("SMTP error"))
    def test_dispatch_failure_logged(self, mock_send_mail, alert, email_rule):
        result = dispatch_notifications(alert.pk)
        assert result["failed"] == 1
        assert result["sent"] == 0
        log = NotificationLog.objects.first()
        assert log.status == "FAILED"
        assert "SMTP error" in log.error_message

    def test_dispatch_nonexistent_alert(self):
        result = dispatch_notifications(99999)
        assert result == {"sent": 0, "failed": 0}

    def test_inactive_rule_skipped(self, alert, email_rule):
        email_rule.is_active = False
        email_rule.save(update_fields=["is_active"])
        result = dispatch_notifications(alert.pk)
        assert result["sent"] == 0

    def test_inactive_channel_skipped(self, alert, email_rule, email_channel):
        email_channel.is_active = False
        email_channel.save(update_fields=["is_active"])
        result = dispatch_notifications(alert.pk)
        assert result["sent"] == 0


# -------------------------------------------------------------------------
# Daily Digest Tests
# -------------------------------------------------------------------------

class TestDailyDigest:

    @patch("apps.iot.tasks.send_mail")
    def test_digest_sends_email(self, mock_send_mail, alert, email_channel):
        result = send_daily_digest()
        assert result["organizations"] == 1
        assert result["emails_sent"] == 1
        mock_send_mail.assert_called_once()
        call_kwargs = mock_send_mail.call_args
        assert "Daily Alert Digest" in call_kwargs[1]["subject"] if "subject" in call_kwargs[1] else "Daily Alert Digest" in call_kwargs[0][0]

    @patch("apps.iot.tasks.send_mail")
    def test_digest_no_alerts_no_email(self, mock_send_mail, email_channel):
        result = send_daily_digest()
        assert result["organizations"] == 0
        assert result["emails_sent"] == 0
        mock_send_mail.assert_not_called()

    @patch("apps.iot.tasks.send_mail")
    def test_digest_acknowledged_alerts_excluded(self, mock_send_mail, alert, email_channel):
        alert.is_acknowledged = True
        alert.save(update_fields=["is_acknowledged"])
        result = send_daily_digest()
        assert result["organizations"] == 0


# -------------------------------------------------------------------------
# Notification Log API Tests
# -------------------------------------------------------------------------

class TestNotificationLogAPI:

    @patch("apps.iot.notification_dispatchers.send_mail")
    def test_list_logs(self, mock_send_mail, authed_client, org, alert, email_rule):
        dispatch_notifications(alert.pk)
        resp = authed_client.get(f"/api/orgs/{org.slug}/notifications/logs/")
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["status"] == "SENT"
