"""Shared pytest fixtures and Factory Boy factories for the Greenhouse SaaS test suite."""

import factory
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.api.models import Membership, Organization
from apps.iot.models import (
    Actuator,
    AutomationRule,
    Command,
    Greenhouse,
    Sensor,
    SensorReading,
    Zone,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating Django User instances."""

    class Meta:
        model = User
        skip_postgeneration_save = True

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.username}@example.com")

    @factory.post_generation
    def password(self, create: bool, extracted: str | None, **kwargs) -> None:
        """Set user password with a default suitable for tests."""
        raw = extracted or "testpass123!"
        self.set_password(raw)
        if create:
            self.save(update_fields=["password"])


class OrganizationFactory(factory.django.DjangoModelFactory):
    """Factory for creating Organization instances."""

    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Organization {n}")
    slug = factory.Sequence(lambda n: f"org-{n}")
    plan = Organization.Plan.FREE


class MembershipFactory(factory.django.DjangoModelFactory):
    """Factory for creating Membership instances."""

    class Meta:
        model = Membership

    user = factory.SubFactory(UserFactory)
    organization = factory.SubFactory(OrganizationFactory)
    role = Membership.Role.OWNER


class GreenhouseFactory(factory.django.DjangoModelFactory):
    """Factory for creating Greenhouse instances."""

    class Meta:
        model = Greenhouse

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Greenhouse {n}")
    location = "Test Location"
    description = "Test greenhouse"
    is_active = True

    @factory.lazy_attribute
    def organization(self):
        """Auto-resolve organization from owner's membership, creating one if needed."""
        membership = Membership.objects.filter(
            user=self.owner, role=Membership.Role.OWNER
        ).select_related("organization").first()
        if membership:
            return membership.organization
        org = Organization.objects.create(
            name=f"{self.owner.username}'s Org",
            slug=f"auto-org-{self.owner.pk}",
        )
        Membership.objects.create(
            user=self.owner, organization=org, role=Membership.Role.OWNER
        )
        return org


class ZoneFactory(factory.django.DjangoModelFactory):
    """Factory for creating Zone instances."""

    class Meta:
        model = Zone

    greenhouse = factory.SubFactory(GreenhouseFactory)
    name = factory.Sequence(lambda n: f"Zone {n}")
    relay_id = factory.Sequence(lambda n: n + 1)
    description = "Test zone"
    is_active = True
    transmission_interval = 300


class SensorFactory(factory.django.DjangoModelFactory):
    """Factory for creating Sensor instances."""

    class Meta:
        model = Sensor

    zone = factory.SubFactory(ZoneFactory)
    sensor_type = Sensor.SensorType.TEMPERATURE
    label = factory.Sequence(lambda n: f"Sensor {n}")
    unit = "°C"
    is_active = True


class SensorReadingFactory(factory.django.DjangoModelFactory):
    """Factory for creating SensorReading instances."""

    class Meta:
        model = SensorReading

    sensor = factory.SubFactory(SensorFactory)
    value = 22.5


class ActuatorFactory(factory.django.DjangoModelFactory):
    """Factory for creating Actuator instances."""

    class Meta:
        model = Actuator

    zone = factory.SubFactory(ZoneFactory)
    actuator_type = Actuator.ActuatorType.VALVE
    name = factory.Sequence(lambda n: f"Actuator {n}")
    state = False
    is_active = True


class CommandFactory(factory.django.DjangoModelFactory):
    """Factory for creating Command instances."""

    class Meta:
        model = Command

    actuator = factory.SubFactory(ActuatorFactory)
    command_type = Command.CommandType.ON
    status = Command.CommandStatus.PENDING


class AutomationRuleFactory(factory.django.DjangoModelFactory):
    """Factory for creating AutomationRule instances."""

    class Meta:
        model = AutomationRule

    zone = factory.SubFactory(ZoneFactory)
    name = factory.Sequence(lambda n: f"Rule {n}")
    sensor_type = Sensor.SensorType.TEMPERATURE
    condition = AutomationRule.Condition.GREATER_THAN
    threshold_value = 30.0
    action_actuator = factory.SubFactory(ActuatorFactory)
    action_command_type = Command.CommandType.ON
    cooldown_seconds = 300
    is_active = True


# ---------------------------------------------------------------------------
# pytest fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def api_client():
    """Return an unauthenticated DRF APIClient."""
    return APIClient()


@pytest.fixture
def user(db):
    """Return a standard test user with a personal organization and OWNER membership."""
    u = UserFactory()
    org = OrganizationFactory(name=f"{u.username}'s Org", slug=f"user-org-{u.pk}")
    MembershipFactory(user=u, organization=org, role=Membership.Role.OWNER)
    return u


@pytest.fixture
def other_user(db):
    """Return a second test user (for isolation tests) with their own organization."""
    u = UserFactory()
    org = OrganizationFactory(name=f"{u.username}'s Org", slug=f"user-org-{u.pk}")
    MembershipFactory(user=u, organization=org, role=Membership.Role.OWNER)
    return u


@pytest.fixture
def auth_client(user):
    """Return an APIClient authenticated as `user` via JWT."""
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def other_auth_client(other_user):
    """Return an APIClient authenticated as `other_user` via JWT."""
    client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def greenhouse(user, db):
    """Return a Greenhouse owned by `user`."""
    return GreenhouseFactory(owner=user)


@pytest.fixture
def zone(greenhouse, db):
    """Return a Zone belonging to `greenhouse`."""
    return ZoneFactory(greenhouse=greenhouse)


@pytest.fixture
def sensor(zone, db):
    """Return a temperature Sensor in `zone`."""
    return SensorFactory(zone=zone)


@pytest.fixture
def actuator(zone, db):
    """Return a Valve Actuator in `zone`."""
    return ActuatorFactory(zone=zone)
