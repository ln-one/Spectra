"""Project space permission and membership service methods."""

from __future__ import annotations

from typing import Optional

from .access import check_project_exists, check_project_permission
from .members import create_project_member as create_project_member_record
from .members import delete_project_member as delete_project_member_record
from .members import get_project_members as get_project_members_list
from .members import update_project_member as update_project_member_record


class ProjectSpaceMemberAPIMixin:
    async def check_project_permission(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        return await check_project_permission(self, project_id, user_id, permission)

    async def check_project_exists(self, project_id: str) -> bool:
        return await check_project_exists(self, project_id)

    async def get_project_members(self, project_id: str, user_id: str):
        return await get_project_members_list(self, project_id, user_id)

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        target_user_id: str,
        role: str,
        permissions: Optional[dict] = None,
    ):
        return await create_project_member_record(
            self,
            project_id=project_id,
            user_id=user_id,
            target_user_id=target_user_id,
            role=role,
            permissions=permissions,
        )

    async def update_project_member(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
        role: Optional[str] = None,
        permissions: Optional[dict] = None,
        status: Optional[str] = None,
    ):
        return await update_project_member_record(
            self,
            project_id=project_id,
            member_id=member_id,
            user_id=user_id,
            role=role,
            permissions=permissions,
            status=status,
        )

    async def delete_project_member(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
    ):
        return await delete_project_member_record(
            self,
            project_id=project_id,
            member_id=member_id,
            user_id=user_id,
        )

    async def check_project_permission_with_member(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        return await self.check_project_permission(project_id, user_id, permission)
