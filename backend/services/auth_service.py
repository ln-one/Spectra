"""Authentication service with password hashing and JWT token management."""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt

from services.database import db_service

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY", "your-super-secret-key-change-in-production"
)
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))


class AuthService:
    """Authentication service for user CRUD, password hashing, and JWT operations."""

    def hash_password(self, password: str) -> str:
        """Hash a plaintext password using bcrypt."""
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify plaintext password against a bcrypt hash."""
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )

    def _create_jwt(
        self, user_id: str, expires_delta: timedelta, token_type: str
    ) -> str:
        """Create JWT with standard claims and token type."""
        expire = datetime.now(timezone.utc) + expires_delta
        payload = {"sub": user_id, "exp": expire, "type": token_type}
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    def create_token(self, user_id: str) -> str:
        """Backward-compatible access token creator."""
        return self.create_access_token(user_id)

    def create_access_token(self, user_id: str) -> str:
        """Create short-lived access token."""
        return self._create_jwt(
            user_id=user_id,
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            token_type="access",
        )

    def create_refresh_token(self, user_id: str) -> str:
        """Create long-lived refresh token."""
        return self._create_jwt(
            user_id=user_id,
            expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
            token_type="refresh",
        )

    def create_auth_tokens(self, user_id: str) -> Dict[str, Any]:
        """Create token pair for auth response contract."""
        return {
            "access_token": self.create_access_token(user_id),
            "refresh_token": self.create_refresh_token(user_id),
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }

    def verify_token(self, token: str, expected_type: str = "access") -> Optional[str]:
        """Verify JWT and return user ID, or None if invalid/expired/type mismatch."""
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            token_type = payload.get("type", "access")
            if not user_id:
                return None
            if expected_type and token_type != expected_type:
                return None
            return user_id
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None

    def verify_refresh_token(self, token: str) -> Optional[str]:
        """Verify refresh token and return user ID."""
        return self.verify_token(token, expected_type="refresh")

    async def create_user(
        self,
        email: str,
        password: str,
        username: str,
        full_name: Optional[str] = None,
    ):
        """Create user with hashed password."""
        password_hash = self.hash_password(password)
        return await db_service.create_user(
            email=email,
            password_hash=password_hash,
            username=username,
            full_name=full_name,
        )

    async def get_user_by_email(self, email: str):
        """Get user by email."""
        return await db_service.get_user_by_email(email)

    async def get_user_by_username(self, username: str):
        """Get user by username."""
        return await db_service.get_user_by_username(username)

    async def authenticate_user(self, email: str, password: str):
        """Authenticate with email and password."""
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not self.verify_password(password, user.password):
            return None
        return user

    async def get_user_by_id(self, user_id: str):
        """Get user by ID."""
        return await db_service.get_user_by_id(user_id)


auth_service = AuthService()
