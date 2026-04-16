"""Local identity mirror helper.

Identity authority belongs to Limora. This package only resolves a stable local
user mirror for Spectra-side ownership and permission checks.
"""

from __future__ import annotations

from typing import Optional

from .store import IdentityMirrorStore
from .usernames import resolve_username


class IdentityService:
    """Thin helper around the local user mirror, not a standalone identity domain."""

    def __init__(self, store: IdentityMirrorStore | None = None):
        self._store = store or IdentityMirrorStore()

    async def get_user_by_id(self, user_id: str):
        return await self._store.get_user_by_id(user_id)

    async def get_user_by_identity_id(self, identity_id: str):
        return await self._store.get_user_by_identity_id(identity_id)

    async def get_user_by_email(self, email: str):
        return await self._store.get_user_by_email(email)

    async def get_user_by_username(self, username: str):
        return await self._store.get_user_by_username(username)

    async def _resolve_username(
        self,
        *,
        identity_id: str,
        preferred_username: Optional[str],
        email: str,
    ) -> str:
        return await resolve_username(
            self,
            identity_id=identity_id,
            preferred_username=preferred_username,
            email=email,
        )

    async def upsert_identity_user(
        self,
        *,
        identity_id: str,
        email: str,
        display_name: Optional[str] = None,
        preferred_username: Optional[str] = None,
    ):
        username = await self._resolve_username(
            identity_id=identity_id,
            preferred_username=preferred_username,
            email=email,
        )
        full_name = (display_name or "").strip() or None
        return await self._store.upsert_user_identity(
            identity_id=identity_id,
            email=email,
            username=username,
            full_name=full_name,
        )


identity_service = IdentityService()
