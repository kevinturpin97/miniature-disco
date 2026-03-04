"""Helper functions for creating audit events."""

from __future__ import annotations

from typing import Any

import structlog

from apps.iot.models import AuditEvent

logger = structlog.get_logger(__name__)


def create_audit_event(
    *,
    user=None,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    description: str = "",
    changes: dict[str, Any] | None = None,
    request=None,
) -> AuditEvent:
    """Create an audit event record.

    Args:
        user: The Django user who performed the action (None for system).
        action: One of AuditEvent.Action choices.
        resource_type: Model/resource name (e.g. 'Greenhouse').
        resource_id: Primary key of the affected resource.
        description: Human-readable description.
        changes: Dict of field changes {field: {old: ..., new: ...}}.
        request: Optional Django request for IP and user-agent extraction.

    Returns:
        The created AuditEvent instance.
    """
    ip_address = None
    user_agent = ""

    if request is not None:
        ip_address = request.META.get(
            "HTTP_X_REAL_IP", request.META.get("REMOTE_ADDR")
        )
        user_agent = request.META.get("HTTP_USER_AGENT", "")

    event = AuditEvent.objects.create(
        user=user,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        description=description,
        changes=changes or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    logger.info(
        "audit_event_created",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user.pk if user else None,
    )

    return event
