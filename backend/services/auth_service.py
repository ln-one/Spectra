"""
Authentication Service (Skeleton)

This is a skeleton implementation. Actual logic will be implemented later.
"""
# REVIEW #B1 (P0): 认证服务核心能力（密码哈希/JWT 签发与校验）尚未落地，导致鉴权链路不可用。

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication service for user management and JWT tokens"""

    async def create_user(
        self, email: str, password: str, username: str, full_name: Optional[str] = None
    ) -> dict:
        """
        Create a new user account

        Args:
            email: User email
            password: Plain text password (will be hashed)
            username: Username
            full_name: Optional full name

        Returns:
            User data dict

        TODO: Implement actual user creation logic
        - Hash password with bcrypt
        - Validate email format
        - Check for duplicate email/username
        - Store in database
        """
        logger.warning("create_user() is not implemented yet")
        raise NotImplementedError("User creation not implemented")

    async def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """
        Verify a password against its hash

        Args:
            plain_password: Plain text password
            hashed_password: Bcrypt hashed password

        Returns:
            True if password matches

        TODO: Implement password verification
        - Use bcrypt to verify
        """
        logger.warning("verify_password() is not implemented yet")
        raise NotImplementedError("Password verification not implemented")

    async def create_token(self, user_id: str) -> str:
        """
        Create a JWT access token

        Args:
            user_id: User ID to encode in token

        Returns:
            JWT token string

        TODO: Implement JWT token creation
        - Use python-jose to create JWT
        - Include user_id in payload
        - Set expiration time from env
        - Sign with JWT_SECRET_KEY
        """
        logger.warning("create_token() is not implemented yet")
        raise NotImplementedError("Token creation not implemented")

    async def verify_token(self, token: str) -> Optional[str]:
        """
        Verify and decode a JWT token

        Args:
            token: JWT token string

        Returns:
            User ID if token is valid, None otherwise

        TODO: Implement JWT token verification
        - Use python-jose to decode JWT
        - Verify signature
        - Check expiration
        - Extract user_id from payload
        """
        logger.warning("verify_token() is not implemented yet")
        raise NotImplementedError("Token verification not implemented")


# Singleton instance
auth_service = AuthService()
