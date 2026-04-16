from __future__ import annotations

from services.database import db_service


class IdentityMirrorStore:
    async def get_user_by_id(self, user_id: str):
        return await db_service.get_user_by_id(user_id)

    async def get_user_by_identity_id(self, identity_id: str):
        return await db_service.get_user_by_identity_id(identity_id)

    async def get_user_by_email(self, email: str):
        return await db_service.get_user_by_email(email)

    async def get_user_by_username(self, username: str):
        return await db_service.get_user_by_username(username)

    async def upsert_user_identity(
        self,
        *,
        identity_id: str,
        email: str,
        username: str,
        full_name: str | None,
    ):
        return await db_service.upsert_user_identity(
            identity_id=identity_id,
            email=email,
            username=username,
            full_name=full_name,
        )
