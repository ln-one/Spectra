from typing import Optional

from schemas.project_space import (
    ProjectMemberRole,
    ProjectMemberStatus,
    ProjectPermission,
)
from utils.exceptions import ConflictException, NotFoundException, ValidationException

from .permission_semantics import (
    normalize_project_member_role,
    normalize_project_member_status,
)


async def get_project_members(service, project_id: str, user_id: str):
    await service.check_project_permission(project_id, user_id, ProjectPermission.VIEW)
    return await service.db.get_project_members(project_id)


async def create_project_member(
    service,
    project_id: str,
    user_id: str,
    target_user_id: str,
    role: ProjectMemberRole | str,
    permissions: Optional[dict] = None,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.MANAGE
    )
    existing = await service.db.get_project_member_by_user(project_id, target_user_id)
    if existing:
        existing_status = getattr(existing, "status", None)
        if existing_status == ProjectMemberStatus.ACTIVE.value:
            raise ConflictException(
                "User "
                f"{target_user_id} is already an active member of project {project_id}"
            )
        raise ConflictException(
            "User "
            f"{target_user_id} already exists in project {project_id}; "
            "update the existing membership instead of creating a duplicate"
        )
    return await service.db.create_project_member(
        project_id=project_id,
        user_id=target_user_id,
        role=normalize_project_member_role(role),
        permissions=permissions,
    )


async def update_project_member(
    service,
    project_id: str,
    member_id: str,
    user_id: str,
    role: Optional[ProjectMemberRole | str] = None,
    permissions: Optional[dict] = None,
    status: Optional[ProjectMemberStatus | str] = None,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.MANAGE
    )
    member = await service.db.get_project_member(member_id)
    if not member or member.projectId != project_id:
        raise NotFoundException(f"Member {member_id} not found in project {project_id}")
    return await service.db.update_project_member(
        member_id=member_id,
        role=normalize_project_member_role(role) if role is not None else None,
        permissions=permissions,
        status=normalize_project_member_status(status) if status is not None else None,
    )


async def delete_project_member(
    service,
    project_id: str,
    member_id: str,
    user_id: str,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.MANAGE
    )
    member = await service.db.get_project_member(member_id)
    if not member or member.projectId != project_id:
        raise NotFoundException(f"Member {member_id} not found in project {project_id}")

    project = await service.db.get_project(project_id)
    if member.userId == project.userId:
        raise ValidationException("Cannot delete project owner")

    return await service.db.delete_project_member(member_id)
