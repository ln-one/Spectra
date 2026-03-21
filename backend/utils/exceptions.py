"""
Custom Exceptions and Error Codes

Defines standard error codes and custom exception classes for the API.
"""

from enum import Enum
from typing import Any, Dict, Optional

from fastapi import HTTPException, status


class ErrorCode(str, Enum):
    """Standard error codes for the API"""

    # Authentication & Authorization (401, 403)
    UNAUTHORIZED = "UNAUTHORIZED"
    INVALID_TOKEN = "INVALID_TOKEN"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    FORBIDDEN = "FORBIDDEN"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"

    # Resource Errors (404, 409)
    NOT_FOUND = "NOT_FOUND"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    DAG_CONFLICT = "DAG_CONFLICT"
    REFERENCE_CONFLICT = "REFERENCE_CONFLICT"

    # Validation Errors (400)
    INVALID_INPUT = "INVALID_INPUT"
    VALIDATION_ERROR = "VALIDATION_ERROR"

    # Rate Limiting & Quota (429)
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"

    # Idempotency (409)
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"

    # Server Errors (500, 503)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"


class APIException(HTTPException):
    """
    Custom API exception with error code and details

    This extends FastAPI's HTTPException to include structured error information.
    """

    def __init__(
        self,
        status_code: int,
        error_code: ErrorCode,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize API exception

        Args:
            status_code: HTTP status code
            error_code: Application-specific error code
            message: Human-readable error message
            details: Optional additional error details
        """
        self.error_code = error_code
        self.message = message
        self.details = details or {}

        # Create detail dict for HTTPException
        detail = {
            "code": error_code.value,
            "message": message,
        }
        if details:
            detail["details"] = details

        super().__init__(status_code=status_code, detail=detail)


# Convenience exception classes for common errors


class UnauthorizedException(APIException):
    """401 Unauthorized"""

    def __init__(
        self,
        message: str = "未登录或登录已过期",
        error_code: ErrorCode = ErrorCode.UNAUTHORIZED,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=error_code,
            message=message,
            details=details,
        )


class ForbiddenException(APIException):
    """403 Forbidden"""

    def __init__(
        self,
        message: str = "无权限访问此资源",
        error_code: ErrorCode = ErrorCode.FORBIDDEN,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=error_code,
            message=message,
            details=details,
        )


class NotFoundException(APIException):
    """404 Not Found"""

    def __init__(
        self,
        message: str = "请求的资源不存在",
        error_code: ErrorCode = ErrorCode.NOT_FOUND,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code=error_code,
            message=message,
            details=details,
        )


class ConflictException(APIException):
    """409 Conflict"""

    def __init__(
        self,
        message: str = "资源冲突",
        error_code: ErrorCode = ErrorCode.RESOURCE_CONFLICT,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code=error_code,
            message=message,
            details=details,
        )


class ValidationException(APIException):
    """400 Bad Request - Validation Error"""

    def __init__(
        self,
        message: str = "请求参数验证失败",
        error_code: ErrorCode = ErrorCode.VALIDATION_ERROR,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=error_code,
            message=message,
            details=details,
        )


class InternalServerException(APIException):
    """500 Internal Server Error"""

    def __init__(
        self,
        message: str = "服务器内部错误",
        error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code=error_code,
            message=message,
            details=details,
        )
