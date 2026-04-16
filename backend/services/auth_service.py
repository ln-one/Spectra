"""Compatibility wrapper for local identity mirror access."""

from services.database import db_service


class AuthService:
    """Retained only for compatibility with existing imports."""

    async def get_user_by_email(self, email: str):
        return await db_service.get_user_by_email(email)

    async def get_user_by_username(self, username: str):
        return await db_service.get_user_by_username(username)

    async def get_user_by_id(self, user_id: str):
        return await db_service.get_user_by_id(user_id)


auth_service = AuthService()
