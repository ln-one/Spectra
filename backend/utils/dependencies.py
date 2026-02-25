"""FastAPI auth dependencies."""

from typing import Optional

from fastapi import Header

from services.auth_service import auth_service
from utils.exceptions import ErrorCode, UnauthorizedException


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Extract and verify bearer token from Authorization header."""
    if not authorization:
        raise UnauthorizedException(
            message="缺少认证头",
            error_code=ErrorCode.UNAUTHORIZED,
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise UnauthorizedException(
            message="认证头格式错误",
            error_code=ErrorCode.INVALID_TOKEN,
        )

    user_id = auth_service.verify_token(token)
    if not user_id:
        raise UnauthorizedException(
            message="令牌无效或已过期",
            error_code=ErrorCode.INVALID_TOKEN,
        )
    return user_id


async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    """Return current user id for valid token, otherwise None."""
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except UnauthorizedException:
        return None
