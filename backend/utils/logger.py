"""
Logging Configuration

Configures structured logging for the application.
Supports both JSON and text formats based on environment configuration.
"""

import logging
import sys
from typing import Any, Dict

try:
    import json_log_formatter

    JSON_FORMATTER_AVAILABLE = True
except ImportError:
    JSON_FORMATTER_AVAILABLE = False


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging

    This is a simple implementation. For production, consider using
    python-json-logger or similar libraries.
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON"""
        log_data: Dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id

        # Import json here to avoid circular imports
        import json

        return json.dumps(log_data, ensure_ascii=False)


def setup_logging(log_level: str = "INFO", log_format: str = "text") -> None:
    """
    Setup application logging

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: Log format ("json" or "text")
    """
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level.upper()))

    # Set formatter based on format type
    if log_format.lower() == "json":
        if JSON_FORMATTER_AVAILABLE:
            formatter = json_log_formatter.JSONFormatter()
        else:
            # Fallback to custom JSON formatter
            formatter = JSONFormatter(
                fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
    else:
        # Text format
        formatter = logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Log startup message
    logger = logging.getLogger(__name__)
    logger.info(f"Logging configured: level={log_level}, format={log_format}")


# Get logger instance for this module
logger = logging.getLogger(__name__)


# TODO: Add request ID middleware
# This middleware can add a unique request_id to each request
# and include it in all log messages for that request
#
# Example:
# class RequestIDMiddleware:
#     async def __call__(self, request: Request, call_next):
#         request_id = str(uuid.uuid4())
#         # Add to request state
#         request.state.request_id = request_id
#         # Add to logging context
#         with logging_context(request_id=request_id):
#             response = await call_next(request)
#         return response
