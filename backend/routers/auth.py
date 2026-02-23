"""
Authentication Router (Skeleton)

This is a skeleton implementation. Returns 501 Not Implemented for all endpoints.
"""

# REVIEW #B1 (P0): 认证路由仍为 501 skeleton，而系统其他路由已依赖认证上下文；当前鉴权链路无法闭环。

import logging

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger(__name__)


@router.post("/register", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def register():
    """
    Register a new user

    TODO: Implement user registration
    - Validate request body (email, password, username)
    - Call auth_service.create_user()
    - Return user data and token
    """
    logger.warning("POST /auth/register is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="User registration not implemented yet",
    )


@router.post("/login", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def login():
    """
    Login with email and password

    TODO: Implement user login
    - Validate request body (email, password)
    - Verify credentials
    - Call auth_service.create_token()
    - Return user data and token
    """
    logger.warning("POST /auth/login is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="User login not implemented yet",
    )


@router.get("/me", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_current_user():
    """
    Get current user information

    TODO: Implement get current user
    - Extract token from Authorization header
    - Verify token
    - Get user from database
    - Return user data
    """
    logger.warning("GET /auth/me is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Get current user not implemented yet",
    )
