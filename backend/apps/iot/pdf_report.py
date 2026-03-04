"""PDF report generator for zone analytics using ReportLab."""

from __future__ import annotations

import io
from datetime import datetime
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


def generate_zone_report_pdf(analytics_data: dict[str, Any]) -> io.BytesIO:
    """Generate a PDF report for a zone's analytics data.

    Args:
        analytics_data: Output from ``compute_zone_analytics()``.

    Returns:
        BytesIO buffer containing the PDF.
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
        spaceAfter=12,
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

    elements: list = []

    # Title
    zone_name = analytics_data.get("zone_name", "Zone")
    period = analytics_data.get("period_days", 7)
    elements.append(Paragraph(f"Zone Report: {zone_name}", title_style))
    elements.append(Paragraph(
        f"Period: last {period} days | "
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        subtitle_style,
    ))

    # Sensor statistics table
    sensors = analytics_data.get("sensors", [])
    if not sensors:
        elements.append(Paragraph("No sensor data available.", styles["Normal"]))
    else:
        elements.append(Paragraph("Sensor Statistics", section_style))

        table_data = [["Sensor", "Unit", "Count", "Min", "Max", "Avg", "StdDev", "Trend"]]
        for s in sensors:
            table_data.append([
                s.get("sensor_type", ""),
                s.get("unit", ""),
                str(s.get("count", 0)),
                _fmt(s.get("min")),
                _fmt(s.get("max")),
                _fmt(s.get("avg")),
                _fmt(s.get("stddev")),
                s.get("trend") or "—",
            ])

        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
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
        elements.append(table)

        # Daily averages per sensor
        for s in sensors:
            daily = s.get("daily_averages", [])
            if not daily:
                continue

            elements.append(Spacer(1, 10 * mm))
            elements.append(Paragraph(
                f"Daily Averages: {s.get('sensor_type', '')} ({s.get('unit', '')})",
                section_style,
            ))

            daily_table_data = [["Date", "Average"]]
            for d in daily:
                daily_table_data.append([d["date"][:10], _fmt(d["avg"])])

            daily_table = Table(daily_table_data, colWidths=[80 * mm, 60 * mm], repeatRows=1)
            daily_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5B8C5A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            elements.append(daily_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer


def _fmt(val: float | None) -> str:
    """Format a numeric value for display."""
    if val is None:
        return "—"
    return f"{val:.2f}"
