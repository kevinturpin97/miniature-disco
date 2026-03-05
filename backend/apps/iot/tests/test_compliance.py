"""Tests for Sprint 25 — Compliance & Agricultural Traceability.

Covers:
- CropCycle model creation and constraints
- Note model creation and constraints
- CultureLog model creation (via signals)
- TraceabilityReport model and PDF generation with SHA256 hash integrity
- CropCycle CRUD API endpoints
- Note CRUD API endpoints
- Culture journal read-only endpoint with filtering
- Traceability PDF generation endpoint
- Traceability hash verification endpoint
- GDPR data export endpoint
- GDPR data erasure (anonymization) endpoint
- GlobalG.A.P. compliant JSON export endpoint
- Signal-driven culture journal auto-logging (Command, Alert, Note, CropCycle)
- Organization membership isolation (cross-org access denied)
"""

import hashlib
from datetime import date, timedelta

import factory
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone as django_tz

from apps.iot.models import (
    Alert,
    CropCycle,
    CultureLog,
    Note,
    TraceabilityReport,
)
from conftest import (
    ActuatorFactory,
    CommandFactory,
    GreenhouseFactory,
    MembershipFactory,
    OrganizationFactory,
    SensorFactory,
    SensorReadingFactory,
    UserFactory,
    ZoneFactory,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Local factories (Sprint 25-specific)
# ---------------------------------------------------------------------------


class CropCycleFactory(factory.django.DjangoModelFactory):
    """Factory for creating CropCycle instances."""

    class Meta:
        model = CropCycle

    zone = factory.SubFactory(ZoneFactory)
    species = "Solanum lycopersicum"
    variety = "Cherry Tomato"
    status = CropCycle.Status.ACTIVE
    sowing_date = factory.LazyFunction(lambda: date.today() - timedelta(days=30))
    created_by = factory.SubFactory(UserFactory)


class NoteFactory(factory.django.DjangoModelFactory):
    """Factory for creating Note instances."""

    class Meta:
        model = Note

    zone = factory.SubFactory(ZoneFactory)
    crop_cycle = None
    author = factory.SubFactory(UserFactory)
    content = "Observed healthy leaf growth across all rows."
    observed_at = factory.LazyFunction(django_tz.now)


class CultureLogFactory(factory.django.DjangoModelFactory):
    """Factory for creating CultureLog instances (typically auto-created by signals)."""

    class Meta:
        model = CultureLog

    zone = factory.SubFactory(ZoneFactory)
    crop_cycle = None
    entry_type = CultureLog.EntryType.NOTE
    summary = "Test culture log entry."
    details = {}
    user = None


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def crop_cycle(zone, user):
    """Return an active CropCycle for the test zone."""
    return CropCycleFactory(zone=zone, created_by=user)


@pytest.fixture
def note(zone, user, crop_cycle):
    """Return a Note for the test zone linked to the crop cycle."""
    return NoteFactory(zone=zone, author=user, crop_cycle=crop_cycle)


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCropCycleModel:
    """Tests for the CropCycle model."""

    def test_create_crop_cycle(self, zone, user):
        """CropCycle can be created with required fields."""
        cc = CropCycle.objects.create(
            zone=zone,
            species="Lactuca sativa",
            variety="Butterhead",
            status=CropCycle.Status.PLANNED,
            created_by=user,
        )
        assert cc.pk is not None
        assert cc.species == "Lactuca sativa"
        assert cc.variety == "Butterhead"
        assert cc.status == CropCycle.Status.PLANNED
        assert cc.zone == zone
        assert cc.created_by == user

    def test_crop_cycle_str(self, zone, user):
        """CropCycle __str__ includes species, variety, zone name, and status."""
        cc = CropCycleFactory(zone=zone, species="Basil", variety="Sweet", created_by=user)
        result = str(cc)
        assert "Basil" in result
        assert "Sweet" in result
        assert zone.name in result
        assert "ACTIVE" in result

    def test_crop_cycle_status_choices(self):
        """All expected status choices are present."""
        statuses = {choice[0] for choice in CropCycle.Status.choices}
        assert statuses == {"PLANNED", "ACTIVE", "HARVESTED", "COMPLETED", "CANCELLED"}


@pytest.mark.django_db
class TestNoteModel:
    """Tests for the Note model."""

    def test_create_note(self, zone, user):
        """Note can be created with required fields."""
        now = django_tz.now()
        note = Note.objects.create(
            zone=zone,
            author=user,
            content="Transplanted seedlings into row 3.",
            observed_at=now,
        )
        assert note.pk is not None
        assert note.content == "Transplanted seedlings into row 3."
        assert note.zone == zone
        assert note.author == user

    def test_note_str(self, zone, user):
        """Note __str__ includes author username and zone name."""
        n = NoteFactory(zone=zone, author=user)
        result = str(n)
        assert user.username in result
        assert zone.name in result


@pytest.mark.django_db
class TestCultureLogModel:
    """Tests for the CultureLog model."""

    def test_create_culture_log(self, zone):
        """CultureLog can be created manually with required fields."""
        cl = CultureLog.objects.create(
            zone=zone,
            entry_type=CultureLog.EntryType.COMMAND,
            summary="Manual test entry.",
            details={"test": True},
        )
        assert cl.pk is not None
        assert cl.entry_type == CultureLog.EntryType.COMMAND
        assert cl.details == {"test": True}

    def test_culture_log_entry_type_choices(self):
        """All expected entry type choices are present."""
        types = {choice[0] for choice in CultureLog.EntryType.choices}
        assert types == {"COMMAND", "ALERT", "NOTE", "THRESHOLD", "CROP", "AUTOMATION"}


@pytest.mark.django_db
class TestTraceabilityReportModel:
    """Tests for the TraceabilityReport model."""

    def test_create_traceability_report(self, zone, user):
        """TraceabilityReport can store PDF bytes and hash."""
        pdf_bytes = b"%PDF-1.4 fake content for testing purposes"
        sha256_hash = hashlib.sha256(pdf_bytes).hexdigest()
        now = django_tz.now()

        report = TraceabilityReport.objects.create(
            zone=zone,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 6, 30),
            pdf_file=pdf_bytes,
            sha256_hash=sha256_hash,
            signed_at=now,
            generated_by=user,
        )
        assert report.pk is not None
        assert len(report.sha256_hash) == 64
        assert report.signed_at == now
        assert bytes(report.pdf_file) == pdf_bytes

    def test_sha256_hash_integrity(self, zone, user):
        """Re-hashing the stored PDF bytes produces the same hash."""
        pdf_bytes = b"some deterministic PDF content for verification"
        sha256_hash = hashlib.sha256(pdf_bytes).hexdigest()
        now = django_tz.now()

        report = TraceabilityReport.objects.create(
            zone=zone,
            period_start=date(2024, 3, 1),
            period_end=date(2024, 3, 31),
            pdf_file=pdf_bytes,
            sha256_hash=sha256_hash,
            signed_at=now,
            generated_by=user,
        )
        recomputed = hashlib.sha256(bytes(report.pdf_file)).hexdigest()
        assert recomputed == report.sha256_hash


# ---------------------------------------------------------------------------
# Signal tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCultureJournalSignals:
    """Tests that signals properly create CultureLog entries."""

    def test_command_creates_culture_log(self, actuator, user):
        """Creating a Command triggers a CultureLog entry with entry_type COMMAND."""
        from apps.iot.models import Command

        initial_count = CultureLog.objects.filter(
            zone=actuator.zone, entry_type=CultureLog.EntryType.COMMAND
        ).count()

        Command.objects.create(
            actuator=actuator,
            command_type=Command.CommandType.ON,
            status=Command.CommandStatus.PENDING,
            created_by=user,
        )

        new_count = CultureLog.objects.filter(
            zone=actuator.zone, entry_type=CultureLog.EntryType.COMMAND
        ).count()
        assert new_count == initial_count + 1

        log = CultureLog.objects.filter(
            zone=actuator.zone, entry_type=CultureLog.EntryType.COMMAND
        ).order_by("-created_at").first()
        assert log is not None
        assert "command" in log.summary.lower() or actuator.name in log.summary
        assert log.details.get("actuator_name") == actuator.name

    def test_alert_creates_culture_log(self, zone, sensor):
        """Creating an Alert triggers a CultureLog entry with entry_type ALERT."""
        initial_count = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.ALERT
        ).count()

        Alert.objects.create(
            zone=zone,
            sensor=sensor,
            alert_type=Alert.AlertType.THRESHOLD_HIGH,
            severity=Alert.Severity.WARNING,
            value=35.0,
            message="Temperature exceeds threshold.",
        )

        new_count = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.ALERT
        ).count()
        assert new_count == initial_count + 1

        log = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.ALERT
        ).order_by("-created_at").first()
        assert log is not None
        assert log.details.get("alert_type") == Alert.AlertType.THRESHOLD_HIGH

    def test_note_creates_culture_log(self, zone, user):
        """Creating a Note triggers a CultureLog entry with entry_type NOTE."""
        initial_count = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.NOTE
        ).count()

        Note.objects.create(
            zone=zone,
            author=user,
            content="Leaves showing slight yellowing.",
            observed_at=django_tz.now(),
        )

        new_count = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.NOTE
        ).count()
        assert new_count == initial_count + 1

        log = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.NOTE
        ).order_by("-created_at").first()
        assert log is not None
        assert "Leaves showing slight yellowing" in log.details.get("content", "")

    def test_crop_cycle_creates_culture_log(self, zone, user):
        """Creating a CropCycle triggers a CultureLog entry with entry_type CROP."""
        initial_count = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.CROP_CYCLE
        ).count()

        CropCycle.objects.create(
            zone=zone,
            species="Fragaria ananassa",
            variety="Albion",
            status=CropCycle.Status.PLANNED,
            created_by=user,
        )

        new_count = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.CROP_CYCLE
        ).count()
        assert new_count == initial_count + 1

        log = CultureLog.objects.filter(
            zone=zone, entry_type=CultureLog.EntryType.CROP_CYCLE
        ).order_by("-created_at").first()
        assert log is not None
        assert "Fragaria ananassa" in log.summary
        assert log.details.get("species") == "Fragaria ananassa"

    def test_command_signal_links_active_crop_cycle(self, actuator, user, crop_cycle):
        """Command signal links the CultureLog to the active crop cycle of the zone."""
        from apps.iot.models import Command

        Command.objects.create(
            actuator=actuator,
            command_type=Command.CommandType.OFF,
            status=Command.CommandStatus.PENDING,
            created_by=user,
        )

        log = CultureLog.objects.filter(
            zone=actuator.zone, entry_type=CultureLog.EntryType.COMMAND
        ).order_by("-created_at").first()
        assert log is not None
        assert log.crop_cycle == crop_cycle


# ---------------------------------------------------------------------------
# CropCycle CRUD API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCropCycleAPI:
    """Tests for CropCycle CRUD endpoints."""

    def test_create_crop_cycle(self, auth_client, zone):
        """POST /api/zones/{zone_id}/crop-cycles/ creates a crop cycle."""
        payload = {
            "species": "Ocimum basilicum",
            "variety": "Genovese",
            "status": "PLANNED",
            "sowing_date": "2024-03-15",
        }
        response = auth_client.post(f"/api/zones/{zone.pk}/crop-cycles/", payload)
        assert response.status_code == 201
        assert response.data["species"] == "Ocimum basilicum"
        assert response.data["variety"] == "Genovese"

    def test_list_crop_cycles(self, auth_client, zone, crop_cycle):
        """GET /api/zones/{zone_id}/crop-cycles/ lists crop cycles for the zone."""
        response = auth_client.get(f"/api/zones/{zone.pk}/crop-cycles/")
        assert response.status_code == 200
        assert len(response.data["results"]) >= 1
        species_list = [cc["species"] for cc in response.data["results"]]
        assert crop_cycle.species in species_list

    def test_retrieve_crop_cycle(self, auth_client, crop_cycle):
        """GET /api/crop-cycles/{id}/ retrieves a specific crop cycle."""
        response = auth_client.get(f"/api/crop-cycles/{crop_cycle.pk}/")
        assert response.status_code == 200
        assert response.data["id"] == crop_cycle.pk
        assert response.data["species"] == crop_cycle.species

    def test_update_crop_cycle(self, auth_client, crop_cycle):
        """PATCH /api/crop-cycles/{id}/ updates a crop cycle."""
        response = auth_client.patch(
            f"/api/crop-cycles/{crop_cycle.pk}/",
            {"status": "HARVESTED", "actual_yield": "4.2 kg/m2"},
        )
        assert response.status_code == 200
        assert response.data["status"] == "HARVESTED"
        assert response.data["actual_yield"] == "4.2 kg/m2"

    def test_delete_crop_cycle(self, auth_client, zone, user):
        """DELETE /api/crop-cycles/{id}/ removes a crop cycle."""
        cc = CropCycleFactory(zone=zone, created_by=user)
        response = auth_client.delete(f"/api/crop-cycles/{cc.pk}/")
        assert response.status_code == 204
        assert not CropCycle.objects.filter(pk=cc.pk).exists()

    def test_other_user_cannot_access_crop_cycles(self, other_auth_client, zone, crop_cycle):
        """Another org's user cannot list crop cycles of a zone they do not own."""
        response = other_auth_client.get(f"/api/zones/{zone.pk}/crop-cycles/")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Note CRUD API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNoteAPI:
    """Tests for Note CRUD endpoints."""

    def test_create_note(self, auth_client, zone):
        """POST /api/zones/{zone_id}/notes/ creates a note."""
        payload = {
            "content": "Applied organic fertilizer to beds.",
            "observed_at": django_tz.now().isoformat(),
        }
        response = auth_client.post(f"/api/zones/{zone.pk}/notes/", payload)
        assert response.status_code == 201
        assert response.data["content"] == "Applied organic fertilizer to beds."

    def test_list_notes(self, auth_client, zone, note):
        """GET /api/zones/{zone_id}/notes/ lists notes for the zone."""
        response = auth_client.get(f"/api/zones/{zone.pk}/notes/")
        assert response.status_code == 200
        assert len(response.data["results"]) >= 1

    def test_retrieve_note(self, auth_client, note):
        """GET /api/notes/{id}/ retrieves a specific note."""
        response = auth_client.get(f"/api/notes/{note.pk}/")
        assert response.status_code == 200
        assert response.data["id"] == note.pk
        assert response.data["content"] == note.content

    def test_update_note(self, auth_client, note):
        """PATCH /api/notes/{id}/ updates a note."""
        response = auth_client.patch(
            f"/api/notes/{note.pk}/",
            {"content": "Updated observation: growth rate increasing."},
        )
        assert response.status_code == 200
        assert response.data["content"] == "Updated observation: growth rate increasing."

    def test_delete_note(self, auth_client, zone, user):
        """DELETE /api/notes/{id}/ removes a note."""
        n = NoteFactory(zone=zone, author=user)
        response = auth_client.delete(f"/api/notes/{n.pk}/")
        assert response.status_code == 204
        assert not Note.objects.filter(pk=n.pk).exists()

    def test_other_user_cannot_access_notes(self, other_auth_client, zone, note):
        """Another org's user cannot list notes of a zone they do not own."""
        response = other_auth_client.get(f"/api/zones/{zone.pk}/notes/")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Culture Journal API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCultureJournalAPI:
    """Tests for the read-only culture journal endpoint."""

    def test_list_culture_journal(self, auth_client, zone, crop_cycle):
        """GET /api/zones/{zone_id}/culture-journal/ returns culture log entries."""
        # Create a note to trigger a journal entry via signal
        Note.objects.create(
            zone=zone,
            author=None,
            content="Routine inspection.",
            observed_at=django_tz.now(),
        )
        response = auth_client.get(f"/api/zones/{zone.pk}/culture-journal/")
        assert response.status_code == 200
        # At minimum we have the CropCycle creation log + the Note log
        assert len(response.data["results"]) >= 1

    def test_filter_by_entry_type(self, auth_client, zone, user):
        """Culture journal can be filtered by entry_type."""
        # Create a note log entry
        Note.objects.create(
            zone=zone, author=user,
            content="Filter test.", observed_at=django_tz.now(),
        )
        response = auth_client.get(
            f"/api/zones/{zone.pk}/culture-journal/", {"entry_type": "NOTE"}
        )
        assert response.status_code == 200
        for entry in response.data["results"]:
            assert entry["entry_type"] == "NOTE"

    def test_filter_by_crop_cycle(self, auth_client, zone, crop_cycle, user):
        """Culture journal can be filtered by crop_cycle FK."""
        # The CropCycle creation itself should have created a CROP log entry
        response = auth_client.get(
            f"/api/zones/{zone.pk}/culture-journal/",
            {"crop_cycle": crop_cycle.pk},
        )
        assert response.status_code == 200
        for entry in response.data["results"]:
            assert entry["crop_cycle"] == crop_cycle.pk

    def test_other_user_cannot_access_journal(self, other_auth_client, zone):
        """Another org's user cannot access the culture journal of a zone they do not own."""
        response = other_auth_client.get(f"/api/zones/{zone.pk}/culture-journal/")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Traceability PDF API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTraceabilityPDFAPI:
    """Tests for the traceability PDF generation and verification endpoints."""

    def test_generate_pdf(self, auth_client, zone, sensor):
        """POST /api/zones/{pk}/traceability/pdf/ returns a PDF with hash headers."""
        # Create some sensor readings
        SensorReadingFactory(sensor=sensor, value=22.0)
        SensorReadingFactory(sensor=sensor, value=24.5)

        payload = {
            "period_start": (date.today() - timedelta(days=7)).isoformat(),
            "period_end": date.today().isoformat(),
        }
        response = auth_client.post(
            f"/api/zones/{zone.pk}/traceability/pdf/", payload
        )
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert "X-SHA256-Hash" in response
        assert "X-Signed-At" in response
        assert len(response["X-SHA256-Hash"]) == 64

        # Verify hash integrity against PDF content
        pdf_content = b"".join(response.streaming_content) if hasattr(response, "streaming_content") else response.content
        recomputed_hash = hashlib.sha256(pdf_content).hexdigest()
        assert recomputed_hash == response["X-SHA256-Hash"]

    def test_generate_pdf_stores_report(self, auth_client, zone, sensor):
        """PDF generation stores a TraceabilityReport record in the database."""
        payload = {
            "period_start": (date.today() - timedelta(days=7)).isoformat(),
            "period_end": date.today().isoformat(),
        }
        initial_count = TraceabilityReport.objects.count()
        auth_client.post(f"/api/zones/{zone.pk}/traceability/pdf/", payload)
        assert TraceabilityReport.objects.count() == initial_count + 1

        report = TraceabilityReport.objects.order_by("-created_at").first()
        assert report is not None
        assert report.zone == zone
        assert report.sha256_hash is not None
        assert len(report.sha256_hash) == 64
        assert report.signed_at is not None

    def test_verify_valid_hash(self, auth_client, zone, user):
        """GET /api/zones/{pk}/traceability/verify/?hash=... returns valid=True for known hash."""
        pdf_bytes = b"known PDF content for test"
        sha256_hash = hashlib.sha256(pdf_bytes).hexdigest()
        TraceabilityReport.objects.create(
            zone=zone,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 6, 30),
            pdf_file=pdf_bytes,
            sha256_hash=sha256_hash,
            signed_at=django_tz.now(),
            generated_by=user,
        )
        response = auth_client.get(
            f"/api/zones/{zone.pk}/traceability/verify/",
            {"hash": sha256_hash},
        )
        assert response.status_code == 200
        assert response.data["valid"] is True
        assert response.data["report_id"] is not None

    def test_verify_invalid_hash(self, auth_client, zone):
        """GET /api/zones/{pk}/traceability/verify/?hash=... returns valid=False for unknown hash."""
        response = auth_client.get(
            f"/api/zones/{zone.pk}/traceability/verify/",
            {"hash": "0" * 64},
        )
        assert response.status_code == 200
        assert response.data["valid"] is False

    def test_verify_missing_hash_param(self, auth_client, zone):
        """GET /api/zones/{pk}/traceability/verify/ without hash param returns 400."""
        response = auth_client.get(f"/api/zones/{zone.pk}/traceability/verify/")
        assert response.status_code == 400

    def test_pdf_invalid_dates(self, auth_client, zone):
        """POST traceability PDF with end date before start date returns 400."""
        payload = {
            "period_start": date.today().isoformat(),
            "period_end": (date.today() - timedelta(days=7)).isoformat(),
        }
        response = auth_client.post(
            f"/api/zones/{zone.pk}/traceability/pdf/", payload
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# GDPR API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGDPRAPI:
    """Tests for GDPR export and erasure endpoints."""

    def test_gdpr_export_contains_expected_keys(self, auth_client, user):
        """GET /api/auth/gdpr/export/ returns JSON with all expected keys."""
        response = auth_client.get("/api/auth/gdpr/export/")
        assert response.status_code == 200
        data = response.data
        expected_keys = {
            "export_date",
            "user",
            "memberships",
            "commands",
            "acknowledged_alerts",
            "crop_cycles",
            "notes",
            "culture_logs",
            "traceability_reports",
        }
        assert expected_keys.issubset(set(data.keys()))

    def test_gdpr_export_user_profile(self, auth_client, user):
        """GDPR export includes correct user profile information."""
        response = auth_client.get("/api/auth/gdpr/export/")
        assert response.status_code == 200
        profile = response.data["user"]
        assert profile["id"] == user.pk
        assert profile["username"] == user.username
        assert profile["email"] == user.email

    def test_gdpr_export_includes_commands(self, auth_client, user, actuator):
        """GDPR export includes commands created by the user."""
        CommandFactory(actuator=actuator, created_by=user)
        response = auth_client.get("/api/auth/gdpr/export/")
        assert response.status_code == 200
        assert len(response.data["commands"]) >= 1

    def test_gdpr_erasure_requires_confirm(self, auth_client):
        """POST /api/auth/gdpr/erasure/ without confirm=true returns 400."""
        response = auth_client.post("/api/auth/gdpr/erasure/", {})
        assert response.status_code == 400

    def test_gdpr_erasure_anonymizes_user(self, auth_client, user, zone):
        """POST /api/auth/gdpr/erasure/ with confirm=true anonymizes the user."""
        # Create some data linked to the user
        NoteFactory(zone=zone, author=user)
        CropCycleFactory(zone=zone, created_by=user)

        response = auth_client.post(
            "/api/auth/gdpr/erasure/",
            {"confirm": True},
            format="json",
        )
        assert response.status_code == 200
        assert "affected_records" in response.data

        # Reload user from DB
        user.refresh_from_db()
        assert user.username == f"anon_{user.pk}"
        assert user.is_active is False
        assert user.email == f"anon_{user.pk}@deleted.local"
        assert user.first_name == ""
        assert user.last_name == ""

    def test_gdpr_erasure_nullifies_foreign_keys(self, auth_client, user, zone, actuator):
        """GDPR erasure nullifies FK references on related models."""
        note = NoteFactory(zone=zone, author=user)
        cc = CropCycleFactory(zone=zone, created_by=user)
        cmd = CommandFactory(actuator=actuator, created_by=user)

        auth_client.post(
            "/api/auth/gdpr/erasure/",
            {"confirm": True},
            format="json",
        )

        note.refresh_from_db()
        cc.refresh_from_db()
        cmd.refresh_from_db()
        assert note.author is None
        assert cc.created_by is None
        assert cmd.created_by is None

    def test_gdpr_erasure_returns_affected_counts(self, auth_client, user, zone, actuator):
        """GDPR erasure response includes affected_records with counts per category."""
        NoteFactory(zone=zone, author=user)
        CommandFactory(actuator=actuator, created_by=user)

        response = auth_client.post(
            "/api/auth/gdpr/erasure/",
            {"confirm": True},
            format="json",
        )
        assert response.status_code == 200
        counts = response.data["affected_records"]
        assert "user_profile" in counts
        assert counts["user_profile"] == 1


# ---------------------------------------------------------------------------
# GlobalG.A.P. Export API tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGlobalGAPExportAPI:
    """Tests for the GlobalG.A.P. JSON export endpoint."""

    def test_export_globalgap(self, auth_client, zone, sensor):
        """GET /api/zones/{pk}/globalgap/export/ returns GlobalG.A.P.-compliant JSON."""
        SensorReadingFactory(sensor=sensor, value=21.0)
        response = auth_client.get(
            f"/api/zones/{zone.pk}/globalgap/export/",
            {"from": "2020-01-01", "to": "2030-12-31"},
        )
        assert response.status_code == 200
        data = response.data
        assert "schema_version" in data
        assert "export_timestamp" in data
        assert "producer" in data
        assert "reporting_period" in data
        assert "environmental_monitoring" in data
        assert "interventions" in data
        assert "observations" in data

    def test_export_globalgap_producer_info(self, auth_client, zone):
        """GlobalG.A.P. export includes correct producer information."""
        response = auth_client.get(
            f"/api/zones/{zone.pk}/globalgap/export/",
            {"from": "2024-01-01", "to": "2024-12-31"},
        )
        assert response.status_code == 200
        producer = response.data["producer"]
        assert producer["production_unit"] == zone.name
        assert producer["facility"] == zone.greenhouse.name

    def test_export_globalgap_missing_dates(self, auth_client, zone):
        """GlobalG.A.P. export returns 400 when from/to query params are missing."""
        response = auth_client.get(f"/api/zones/{zone.pk}/globalgap/export/")
        assert response.status_code == 400

    def test_export_globalgap_invalid_dates(self, auth_client, zone):
        """GlobalG.A.P. export returns 400 for malformed dates."""
        response = auth_client.get(
            f"/api/zones/{zone.pk}/globalgap/export/",
            {"from": "not-a-date", "to": "also-not"},
        )
        assert response.status_code == 400

    def test_other_user_cannot_access_globalgap(self, other_auth_client, zone):
        """Another org's user cannot export GlobalG.A.P. data for a zone they do not own."""
        response = other_auth_client.get(
            f"/api/zones/{zone.pk}/globalgap/export/",
            {"from": "2024-01-01", "to": "2024-12-31"},
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Organization isolation tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOrganizationIsolation:
    """Tests that cross-organization access is denied."""

    def test_other_user_cannot_retrieve_crop_cycle(self, other_auth_client, crop_cycle):
        """A user from another org cannot retrieve a crop cycle detail."""
        response = other_auth_client.get(f"/api/crop-cycles/{crop_cycle.pk}/")
        assert response.status_code == 404

    def test_other_user_cannot_update_note(self, other_auth_client, note):
        """A user from another org cannot update a note."""
        response = other_auth_client.patch(
            f"/api/notes/{note.pk}/", {"content": "Hacked content."}
        )
        assert response.status_code == 404

    def test_other_user_cannot_generate_pdf(self, other_auth_client, zone):
        """A user from another org cannot generate traceability PDF for a zone."""
        payload = {
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
        }
        response = other_auth_client.post(
            f"/api/zones/{zone.pk}/traceability/pdf/", payload
        )
        assert response.status_code == 404

    def test_unauthenticated_access_denied(self, api_client, zone):
        """Unauthenticated requests to compliance endpoints are denied."""
        endpoints = [
            f"/api/zones/{zone.pk}/crop-cycles/",
            f"/api/zones/{zone.pk}/notes/",
            f"/api/zones/{zone.pk}/culture-journal/",
            "/api/auth/gdpr/export/",
        ]
        for url in endpoints:
            response = api_client.get(url)
            assert response.status_code == 401, f"Expected 401 for {url}, got {response.status_code}"
