import logging

from utils.exceptions import InternalServerException

logger = logging.getLogger(__name__)


def handle_rag_error(message: str, exc: Exception) -> InternalServerException:
    logger.error("%s: %s", message, exc, exc_info=True)
    return InternalServerException(
        message=message,
        details={"component": "rag_router", "exception_type": type(exc).__name__},
    )
