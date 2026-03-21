"""Global exception handlers."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

try:
    from prisma.errors import PrismaError
except ModuleNotFoundError:  # pragma: no cover - test/runtime fallback

    class PrismaError(Exception):
        pass


from utils.exceptions import APIException
from utils.middleware import get_request_id
from utils.responses import error_response

logger = logging.getLogger(__name__)


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {
        status.HTTP_429_TOO_MANY_REQUESTS,
        status.HTTP_502_BAD_GATEWAY,
        status.HTTP_503_SERVICE_UNAVAILABLE,
        status.HTTP_504_GATEWAY_TIMEOUT,
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Register project-wide exception handlers."""

    @app.exception_handler(APIException)
    async def api_exception_handler(request: Request, exc: APIException):
        details = dict(exc.details) if exc.details else {}
        request_id = get_request_id()
        if request_id:
            details["request_id"] = request_id

        return JSONResponse(
            status_code=exc.status_code,
            content=error_response(
                code=exc.error_code.value,
                message=exc.message,
                details=details or None,
                retryable=_is_retryable_status(exc.status_code),
                trace_id=request_id,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        details = {"errors": exc.errors()}
        request_id = get_request_id()
        if request_id:
            details["request_id"] = request_id

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_response(
                code="VALIDATION_ERROR",
                message="请求参数验证失败",
                details=details,
                retryable=False,
                trace_id=request_id,
            ),
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        request_id = get_request_id() or "-"

        if isinstance(exc, PrismaError):
            logger.error(
                "database_error: %s request_id=%s", exc, request_id, exc_info=True
            )
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=error_response(
                    code="SERVICE_UNAVAILABLE",
                    message="数据库服务暂不可用，请稍后重试",
                    details={"request_id": request_id},
                    retryable=True,
                    trace_id=request_id,
                ),
            )

        if isinstance(exc, (ValueError, TypeError, KeyError)):
            logger.warning(
                "bad_request_mapped: %s request_id=%s",
                exc,
                request_id,
                exc_info=True,
            )
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=error_response(
                    code="INVALID_INPUT",
                    message="请求参数错误",
                    details={"request_id": request_id},
                    retryable=False,
                    trace_id=request_id,
                ),
            )

        if isinstance(exc, (TimeoutError, ConnectionError)):
            logger.error(
                "upstream_timeout: %s request_id=%s",
                exc,
                request_id,
                exc_info=True,
            )
            return JSONResponse(
                status_code=status.HTTP_502_BAD_GATEWAY,
                content=error_response(
                    code="EXTERNAL_SERVICE_ERROR",
                    message="上游服务超时或不可达",
                    details={"request_id": request_id},
                    retryable=True,
                    trace_id=request_id,
                ),
            )

        logger.error(
            "unhandled_error: %s request_id=%s", exc, request_id, exc_info=True
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response(
                code="INTERNAL_ERROR",
                message="服务器内部错误",
                details={"request_id": request_id},
                retryable=False,
                trace_id=request_id,
            ),
        )
