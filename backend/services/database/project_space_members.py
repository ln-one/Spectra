import json
from typing import Optional

from schemas.project_member_semantics import (
    normalize_project_member_role,
    normalize_project_member_status,
    normalize_project_permissions,
    resolve_project_member_permissions,
)
from schemas.project_space import ProjectMemberRole, ProjectMemberStatus


class ProjectSpaceMemberMixin:
    async def get_project_members(self, project_id: str):
        return await self.db.projectmember.find_many(
            where={"projectId": project_id, "status": ProjectMemberStatus.ACTIVE},
            order={"createdAt": "asc"},
        )

    async def get_project_member(self, member_id: str):
        return await self.db.projectmember.find_unique(where={"id": member_id})

    async def get_project_member_by_user(self, project_id: str, user_id: str):
        return await self.db.projectmember.find_first(
            where={
                "projectId": project_id,
                "userId": user_id,
                "status": ProjectMemberStatus.ACTIVE,
            }
        )

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        role: ProjectMemberRole | str,
        permissions: Optional[dict],
    ):
        normalized_role = normalize_project_member_role(role)
        data = {"projectId": project_id, "userId": user_id, "role": normalized_role}
        resolved_permissions = resolve_project_member_permissions(
            normalized_role, permissions
        )
        if resolved_permissions:
            data["permissions"] = json.dumps(resolved_permissions)
        return await self.db.projectmember.create(data=data)

    async def update_project_member(
        self,
        member_id: str,
        role: Optional[ProjectMemberRole | str] = None,
        permissions: Optional[dict] = None,
        status: Optional[ProjectMemberStatus | str] = None,
    ):
        data = {}
        if role is not None:
            data["role"] = normalize_project_member_role(role)
        if permissions is not None:
            data["permissions"] = json.dumps(normalize_project_permissions(permissions))
        if status is not None:
            data["status"] = normalize_project_member_status(status)
        return await self.db.projectmember.update(where={"id": member_id}, data=data)

    async def delete_project_member(self, member_id: str):
        return await self.db.projectmember.delete(where={"id": member_id})
