"""
FastAPI Dependencies (Skeleton)

This module provides dependency injection functions for FastAPI routes.
"""

import logging
from typing import Optional

from fastapi import Header, HTTPException

from services.auth_service import auth_service

logger = logging.getLogger(__name__)


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """
    Get current user ID from JWT token

    This is a SKELETON implementation with basic token extraction.
    Full JWT verification will be implemented when auth_service is complete.

    Args:
        authorization: Authorization header (Bearer <token>)

    Returns:
        User ID string

    Raises:
        HTTPException: If token is invalid or missing

    TODO: Complete JWT verification when auth_service.verify_token() is implemented
    """
    import os

    # 只在开发环境允许无认证访问
    if not authorization:
        if os.getenv("ALLOW_ANONYMOUS_ACCESS", "false").lower() == "true":
            logger.warning(
                "No authorization header provided, using test user_id (DEVELOPMENT ONLY)"
            )
            return "test-user-id-12345"
        else:
            raise HTTPException(
                status_code=401,
                detail="Missing authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Extract token from Bearer scheme
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify token using auth_service
        user_id = await auth_service.verify_token(token)
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return user_id

    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )


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
