"""FastAPI auth dependencies."""

from typing import Optional

from fastapi import Request

from services.identity_service import identity_service
from services.platform.limora_client import build_limora_client
from utils.exceptions import ErrorCode, UnauthorizedException
from utils.middleware import set_context_user_id


async def get_current_user(
    request: Request,
) -> str:
    """Resolve the current user through the Limora cookie session."""
    cookie_header = request.headers.get("cookie")
    if not cookie_header:
        raise UnauthorizedException(
            message="登录可能过期（缺少会话 Cookie）",
            error_code=ErrorCode.UNAUTHORIZED,
        )

    client = build_limora_client()
    if client is None:
        raise UnauthorizedException(
            message="Limora 身份服务未启用",
            error_code=ErrorCode.UNAUTHORIZED,
        )
    current = await client.get_current_session(cookie_header=cookie_header)
    user = await identity_service.upsert_identity_user(
        identity_id=current.identity_id,
        email=current.email,
        display_name=current.name,
    )
    user_id = str(getattr(user, "id", "") or current.identity_id)

    # Publish user_id into the request context for logging
    set_context_user_id(user_id)

    return user_id


async def get_current_user_optional(
    request: Request,
) -> Optional[str]:
    """Return current user id for valid token, otherwise None."""
    if not request.headers.get("cookie"):
        return None
    try:
        return await get_current_user(request)
    except UnauthorizedException:
        return None
