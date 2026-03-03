"""
Custom exception handlers for the Greenhouse SaaS API.
"""

from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """Custom exception handler that wraps errors in a consistent format."""
    response = exception_handler(exc, context)

    if response is not None:
        response.data = {
            "error": True,
            "status_code": response.status_code,
            "details": response.data,
        }

    return response
