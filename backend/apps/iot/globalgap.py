"""GlobalG.A.P. compliant export module.

Generates a JSON export conforming to a normalized schema suitable for
GlobalG.A.P. agricultural certification requirements. The schema captures:
- Crop cycle information (species, variety, dates)
- Environmental conditions (sensor data summary)
- Interventions (commands, alerts, manual observations)
- Traceability metadata (report hash, generation timestamp)
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any


GLOBALGAP_SCHEMA_VERSION = "1.0.0"


def export_globalgap(
    zone_name: str,
    greenhouse_name: str,
    organization_name: str,
    period_start: date,
    period_end: date,
    crop_cycle: dict[str, Any] | None,
    sensor_stats: list[dict[str, Any]],
    culture_logs: list[dict[str, Any]],
    notes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate a GlobalG.A.P.-compliant JSON export for a zone.

    Args:
        zone_name: Name of the zone.
        greenhouse_name: Name of the greenhouse.
        organization_name: Name of the organization.
        period_start: Start of the reporting period.
        period_end: End of the reporting period.
        crop_cycle: Optional crop cycle data dict.
        sensor_stats: Aggregated sensor statistics for the period.
        culture_logs: Culture journal entries for the period.
        notes: Manual notes for the period.

    Returns:
        A dict conforming to the GlobalG.A.P. JSON schema.
    """
    # Build crop production record
    production_record: dict[str, Any] = {}
    if crop_cycle:
        production_record = {
            "species": crop_cycle.get("species", ""),
            "variety": crop_cycle.get("variety", ""),
            "status": crop_cycle.get("status", ""),
            "sowing_date": _date_str(crop_cycle.get("sowing_date")),
            "transplant_date": _date_str(crop_cycle.get("transplant_date")),
            "harvest_start_date": _date_str(crop_cycle.get("harvest_start_date")),
            "harvest_end_date": _date_str(crop_cycle.get("harvest_end_date")),
            "expected_yield": crop_cycle.get("expected_yield", ""),
            "actual_yield": crop_cycle.get("actual_yield", ""),
        }

    # Build environmental monitoring record
    environmental_records = []
    for s in sensor_stats:
        environmental_records.append({
            "parameter": s.get("sensor_type", ""),
            "unit": s.get("unit", ""),
            "measurement_count": s.get("count", 0),
            "minimum": s.get("min"),
            "maximum": s.get("max"),
            "average": s.get("avg"),
            "standard_deviation": s.get("stddev"),
        })

    # Build intervention records
    interventions = []
    for log in culture_logs:
        created_at = log.get("created_at", "")
        if hasattr(created_at, "isoformat"):
            created_at = created_at.isoformat()
        interventions.append({
            "timestamp": str(created_at),
            "type": log.get("entry_type", ""),
            "description": log.get("summary", ""),
            "operator": log.get("username", ""),
            "details": log.get("details", {}),
        })

    # Build observation records
    observations = []
    for note in notes:
        observed_at = note.get("observed_at", "")
        if hasattr(observed_at, "isoformat"):
            observed_at = observed_at.isoformat()
        observations.append({
            "timestamp": str(observed_at),
            "observer": note.get("author_username", ""),
            "content": note.get("content", ""),
        })

    return {
        "schema_version": GLOBALGAP_SCHEMA_VERSION,
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "producer": {
            "organization": organization_name,
            "facility": greenhouse_name,
            "production_unit": zone_name,
        },
        "reporting_period": {
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
        },
        "production_record": production_record,
        "environmental_monitoring": environmental_records,
        "interventions": interventions,
        "observations": observations,
    }


def _date_str(val: Any) -> str | None:
    """Convert a date value to ISO string, handling None."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val) if val else None
