"""FastAPI auth dependencies."""

from typing import Optional

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.auth_service import auth_service
from utils.exceptions import ErrorCode, UnauthorizedException
from utils.middleware import set_context_user_id

_security = HTTPBearer(auto_error=False, scheme_name="BearerAuth")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
) -> str:
    """Extract and verify bearer token from Authorization header."""
    if not credentials:
        raise UnauthorizedException(
            message="登录可能过期（缺少认证头）",
            error_code=ErrorCode.UNAUTHORIZED,
        )

    token = credentials.credentials
    if not token:
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

    # Publish user_id into the request context for logging
    set_context_user_id(user_id)

    return user_id


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
) -> Optional[str]:
    """Return current user id for valid token, otherwise None."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except UnauthorizedException:
        return None
