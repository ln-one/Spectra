"""
Authentication Service (Skeleton)

This is a skeleton implementation with basic structure.
Actual JWT and password hashing will be implemented when needed.
"""

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
        logger.warning("create_user() is not fully implemented yet")
        # TODO: Implement with bcrypt and database
        return {
            "id": "user-123",
            "email": email,
            "username": username,
            "full_name": full_name,
        }

    async def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """
        Verify a password against its hash

        Args:
            plain_password: Plain text password
            hashed_password: Bcrypt hashed password

        Returns:
            True if password matches

        TODO: Implement password verification with bcrypt
        """
        logger.warning("verify_password() is not fully implemented yet")
        # TODO: Use bcrypt.checkpw()
        return True  # Temporary for testing

    async def create_token(self, user_id: str) -> str:
        """
        Create a JWT access token

        Args:
            user_id: User ID to encode in token

        Returns:
            JWT token string

        TODO: Implement JWT token creation with python-jose
        - Include user_id in payload
        - Set expiration time from env
        - Sign with JWT_SECRET_KEY
        """
        logger.warning("create_token() is not fully implemented yet")
        # TODO: Use jose.jwt.encode()
        return f"mock-jwt-token-{user_id}"  # Temporary for testing

    async def verify_token(self, token: str) -> Optional[str]:
        """
        Verify and decode a JWT token

        Args:
            token: JWT token string

        Returns:
            User ID if token is valid, None otherwise

        TODO: Implement JWT token verification with python-jose
        - Verify signature
        - Check expiration
        - Extract user_id from payload
        """
        logger.warning("verify_token() is not fully implemented yet")
        # TODO: Use jose.jwt.decode()
        # For now, extract user_id from mock token
        if token.startswith("mock-jwt-token-"):
            return token.replace("mock-jwt-token-", "")
        return "test-user-id-12345"  # Temporary for testing


# Singleton instance
auth_service = AuthService()
