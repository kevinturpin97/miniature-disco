"""
Custom exception handlers for the Greenhouse SaaS API.
"""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """Custom exception handler that wraps errors in a consistent format.

    All API errors are returned as::

        {
            "error": true,
            "status_code": <int>,
            "details": <str | dict>
        }

    Unhandled exceptions (500) are logged and return a generic message.
    """
    response = exception_handler(exc, context)

    if response is not None:
        response.data = {
            "error": True,
            "status_code": response.status_code,
            "details": response.data,
        }
        return response

    # Unhandled exception — DRF returned None
    logger.exception("Unhandled exception in %s", context.get("view", "unknown"), exc_info=exc)
    return Response(
        {
            "error": True,
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "details": {"detail": "Internal server error."},
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
