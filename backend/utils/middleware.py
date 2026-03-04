"""Security middleware for Content-Security-Policy and audit logging."""

import structlog
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin

logger = structlog.get_logger(__name__)


class ContentSecurityPolicyMiddleware(MiddlewareMixin):
    """Add Content-Security-Policy header to all responses in production.

    Reads CSP directives from Django settings (CSP_DEFAULT_SRC, CSP_SCRIPT_SRC, etc.)
    and assembles the header value. Only active when DEBUG is False.
    """

    def process_response(self, request, response):
        if settings.DEBUG:
            return response

        directives = []
        csp_settings = {
            "default-src": getattr(settings, "CSP_DEFAULT_SRC", "'self'"),
            "script-src": getattr(settings, "CSP_SCRIPT_SRC", "'self'"),
            "style-src": getattr(settings, "CSP_STYLE_SRC", "'self'"),
            "img-src": getattr(settings, "CSP_IMG_SRC", "'self'"),
            "font-src": getattr(settings, "CSP_FONT_SRC", "'self'"),
            "connect-src": getattr(settings, "CSP_CONNECT_SRC", "'self'"),
            "frame-ancestors": getattr(settings, "CSP_FRAME_ANCESTORS", "'none'"),
        }

        for directive, value in csp_settings.items():
            if value:
                directives.append(f"{directive} {value}")

        if directives:
            response["Content-Security-Policy"] = "; ".join(directives)

        return response


class AuditLoggingMiddleware(MiddlewareMixin):
    """Log mutating API requests for audit trail.

    Records POST, PUT, PATCH, DELETE requests to /api/ endpoints with
    user info and response status. This supplements the AuditEvent model
    for requests that need lightweight logging without DB writes.
    """

    AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def process_response(self, request, response):
        if request.method not in self.AUDIT_METHODS:
            return response

        if not request.path.startswith("/api/"):
            return response

        user_id = None
        username = "anonymous"
        if hasattr(request, "user") and request.user.is_authenticated:
            user_id = request.user.pk
            username = request.user.username

        logger.info(
            "api_audit",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
            user_id=user_id,
            username=username,
            ip=request.META.get("HTTP_X_REAL_IP", request.META.get("REMOTE_ADDR")),
        )

        return response
