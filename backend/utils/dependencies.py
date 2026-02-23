"""
FastAPI Dependencies (Skeleton)

This module provides dependency injection functions for FastAPI routes.
"""

import logging
from typing import Optional

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """
    Get current user ID from JWT token

    This is a SKELETON implementation that returns a fixed user_id for testing.
    In production, this should:
    1. Extract token from Authorization header
    2. Verify token using auth_service
    3. Return actual user_id from token

    Args:
        authorization: Authorization header (Bearer <token>)

    Returns:
        User ID string

    Raises:
        HTTPException: If token is invalid or missing

    TODO: Implement actual JWT verification
    - Extract token from "Bearer <token>" format
    - Call auth_service.verify_token()
    - Return user_id from token payload
    - Raise 401 if token is invalid
    """
    # REVIEW #B1 (P0): 当前返回固定 user_id，未校验 JWT，任何请求都可绕过认证进入受保护接口。
    # TEMPORARY: Return fixed user_id for testing
    # Remove this when implementing actual authentication
    logger.warning(
        "get_current_user() is using a fixed user_id. Implement JWT verification!"
    )

    # For now, return a fixed user_id to allow testing other features
    return "test-user-id-12345"

    # TODO: Uncomment and implement this logic:
    # if not authorization:
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED,
    #         detail="Missing authorization header",
    #         headers={"WWW-Authenticate": "Bearer"},
    #     )
    #
    # try:
    #     scheme, token = authorization.split()
    #     if scheme.lower() != "bearer":
    #         raise HTTPException(
    #             status_code=status.HTTP_401_UNAUTHORIZED,
    #             detail="Invalid authentication scheme",
    #             headers={"WWW-Authenticate": "Bearer"},
    #         )
    #
    #     user_id = await auth_service.verify_token(token)
    #     if not user_id:
    #         raise HTTPException(
    #             status_code=status.HTTP_401_UNAUTHORIZED,
    #             detail="Invalid or expired token",
    #             headers={"WWW-Authenticate": "Bearer"},
    #         )
    #
    #     return user_id
    # except ValueError:
    #     raise HTTPException(
    #         status_code=status.HTTP_401_UNAUTHORIZED,
    #         detail="Invalid authorization header format",
    #         headers={"WWW-Authenticate": "Bearer"},
    #     )


# Optional dependency that allows unauthenticated access
async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    """
    Get current user ID if authenticated, None otherwise

    This is useful for endpoints that work differently for
    authenticated vs anonymous users.

    Args:
        authorization: Authorization header (Bearer <token>)

    Returns:
        User ID string if authenticated, None otherwise
    """
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
