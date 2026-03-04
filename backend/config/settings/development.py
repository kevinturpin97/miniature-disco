"""
Development settings for Greenhouse SaaS.
"""

from .base import *  # noqa: F401, F403

from utils.logging import configure_structlog, get_logging_config

DEBUG = True

# Allow all hosts in development
ALLOWED_HOSTS = ["*"]

# Additional dev apps
INSTALLED_APPS += []  # noqa: F405

# Structured logging (colored console output in dev)
configure_structlog(debug=True)
LOGGING = get_logging_config(debug=True)
