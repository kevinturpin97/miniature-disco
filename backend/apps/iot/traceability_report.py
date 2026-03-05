"""Traceability PDF report generator for agricultural compliance.

Generates a detailed PDF including crop cycle information, sensor conditions,
interventions (commands, alerts, notes), and a SHA256 digital signature.
"""

from __future__ import annotations

import hashlib
import io
from datetime import date, datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def generate_traceability_pdf(
    zone_name: str,
    greenhouse_name: str,
    period_start: date,
    period_end: date,
    crop_cycle: dict[str, Any] | None,
    sensor_stats: list[dict[str, Any]],
    culture_logs: list[dict[str, Any]],
    notes: list[dict[str, Any]],
) -> tuple[bytes, str, datetime]:
    """Generate a traceability PDF report with SHA256 signature.

    Args:
        zone_name: Name of the zone.
        greenhouse_name: Name of the greenhouse.
        period_start: Start of the reporting period.
        period_end: End of the reporting period.
        crop_cycle: Optional crop cycle data dict.
        sensor_stats: Aggregated sensor statistics for the period.
        culture_logs: Culture journal entries for the period.
        notes: Manual notes for the period.

    Returns:
        Tuple of (pdf_bytes, sha256_hash, signed_at_timestamp).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.gray,
        spaceAfter=20,
    )
    section_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontSize=14,
        spaceAfter=8,
        spaceBefore=16,
    )
    body_style = styles["Normal"]

    elements: list = []

    # --- Title ---
    elements.append(Paragraph("Traceability Report", title_style))
    elements.append(Paragraph(
        f"Zone: {zone_name} | Greenhouse: {greenhouse_name}<br/>"
        f"Period: {period_start.isoformat()} to {period_end.isoformat()}",
        subtitle_style,
    ))

    # --- Crop Cycle ---
    if crop_cycle:
        elements.append(Paragraph("Crop Cycle", section_style))
        crop_data = [
            ["Species", crop_cycle.get("species", "—")],
            ["Variety", crop_cycle.get("variety", "") or "—"],
            ["Status", crop_cycle.get("status", "—")],
            ["Sowing Date", str(crop_cycle.get("sowing_date", "—") or "—")],
            ["Transplant Date", str(crop_cycle.get("transplant_date", "—") or "—")],
            ["Harvest Start", str(crop_cycle.get("harvest_start_date", "—") or "—")],
            ["Harvest End", str(crop_cycle.get("harvest_end_date", "—") or "—")],
            ["Expected Yield", crop_cycle.get("expected_yield", "") or "—"],
            ["Actual Yield", crop_cycle.get("actual_yield", "") or "—"],
        ]
        crop_table = Table(crop_data, colWidths=[50 * mm, 120 * mm])
        crop_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(crop_table)

    # --- Sensor Statistics ---
    if sensor_stats:
        elements.append(Paragraph("Environmental Conditions", section_style))
        stat_header = ["Sensor", "Unit", "Readings", "Min", "Max", "Avg"]
        stat_rows = [stat_header]
        for s in sensor_stats:
            stat_rows.append([
                s.get("sensor_type", ""),
                s.get("unit", ""),
                str(s.get("count", 0)),
                _fmt(s.get("min")),
                _fmt(s.get("max")),
                _fmt(s.get("avg")),
            ])
        stat_table = Table(stat_rows, repeatRows=1)
        stat_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F7942")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(stat_table)

    # --- Culture Journal (Interventions) ---
    if culture_logs:
        elements.append(Paragraph("Interventions Journal", section_style))
        log_header = ["Date", "Type", "Summary"]
        log_rows = [log_header]
        for log in culture_logs:
            log_rows.append([
                str(log.get("created_at", ""))[:16],
                log.get("entry_type_display", log.get("entry_type", "")),
                log.get("summary", "")[:80],
            ])
        log_table = Table(log_rows, colWidths=[35 * mm, 30 * mm, 110 * mm], repeatRows=1)
        log_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5B8C5A")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        elements.append(log_table)

    # --- Manual Notes ---
    if notes:
        elements.append(Paragraph("Field Observations", section_style))
        for note in notes:
            observed = str(note.get("observed_at", ""))[:16]
            author = note.get("author_username", "anonymous")
            content = note.get("content", "")
            elements.append(Paragraph(
                f"<b>{observed}</b> ({author}): {content}",
                body_style,
            ))
            elements.append(Spacer(1, 3 * mm))

    # --- Signature block (placeholder — hash computed after build) ---
    elements.append(Spacer(1, 15 * mm))
    signed_at = datetime.now(timezone.utc)
    elements.append(Paragraph(
        f"Report generated: {signed_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        subtitle_style,
    ))
    elements.append(Paragraph(
        "SHA256 digital signature will be appended to the report metadata.",
        subtitle_style,
    ))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    sha256_hash = hashlib.sha256(pdf_bytes).hexdigest()

    return pdf_bytes, sha256_hash, signed_at


def _fmt(val: float | None) -> str:
    """Format a numeric value for display."""
    if val is None:
        return "—"
    return f"{val:.2f}"
