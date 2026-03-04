"""Structured logging configuration using structlog.

Provides JSON-formatted structured logging for both development and
production environments. In development, renders logs with colors and
human-readable formatting. In production, emits newline-delimited JSON.
"""

import logging
import sys

import structlog


def configure_structlog(debug: bool = False) -> None:
    """Configure structlog for the application.

    Args:
        debug: When True, use console-friendly colored output.
               When False, emit JSON for log aggregation.
    """
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if debug:
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(colors=True)
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logging_config(debug: bool = False) -> dict:
    """Return a Django LOGGING dict that routes stdlib logging through structlog.

    Args:
        debug: When True, set root level to DEBUG.
               When False, set root level to INFO.

    Returns:
        A Django LOGGING configuration dictionary.
    """
    if debug:
        formatter_class = "structlog.stdlib.ProcessorFormatter"
        processors = [
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    else:
        formatter_class = "structlog.stdlib.ProcessorFormatter"
        processors = [
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ]

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "structlog": {
                "()": formatter_class,
                "processors": processors,
                "foreign_pre_chain": [
                    structlog.contextvars.merge_contextvars,
                    structlog.stdlib.add_logger_name,
                    structlog.stdlib.add_log_level,
                    structlog.processors.TimeStamper(fmt="iso"),
                    structlog.processors.StackInfoRenderer(),
                    structlog.processors.UnicodeDecoder(),
                    structlog.processors.format_exc_info,
                ],
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": sys.stderr,
                "formatter": "structlog",
            },
        },
        "root": {
            "handlers": ["console"],
            "level": "DEBUG" if debug else "INFO",
        },
        "loggers": {
            "django": {
                "handlers": ["console"],
                "level": "INFO" if debug else "WARNING",
                "propagate": False,
            },
            "django.request": {
                "handlers": ["console"],
                "level": "INFO" if debug else "WARNING",
                "propagate": False,
            },
            "apps.iot": {
                "handlers": ["console"],
                "level": "DEBUG" if debug else "INFO",
                "propagate": False,
            },
            "apps.api": {
                "handlers": ["console"],
                "level": "DEBUG" if debug else "INFO",
                "propagate": False,
            },
            "celery": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
        },
    }
