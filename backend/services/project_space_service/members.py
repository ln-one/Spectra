from typing import Optional

from utils.exceptions import ConflictException, NotFoundException, ValidationException


async def get_project_members(service, project_id: str, user_id: str):
    await service.check_project_permission(project_id, user_id, "can_view")
    return await service.db.get_project_members(project_id)


async def create_project_member(
    service,
    project_id: str,
    user_id: str,
    target_user_id: str,
    role: str,
    permissions: Optional[dict] = None,
):
    await service.check_project_permission(project_id, user_id, "can_manage")
    existing = await service.db.get_project_member_by_user(project_id, target_user_id)
    if existing:
        raise ConflictException(
            "User "
            f"{target_user_id} is already an active member of project {project_id}"
        )
    return await service.db.create_project_member(
        project_id=project_id,
        user_id=target_user_id,
        role=role,
        permissions=permissions,
    )


async def update_project_member(
    service,
    project_id: str,
    member_id: str,
    user_id: str,
    role: Optional[str] = None,
    permissions: Optional[dict] = None,
    status: Optional[str] = None,
):
    await service.check_project_permission(project_id, user_id, "can_manage")
    member = await service.db.get_project_member(member_id)
    if not member or member.projectId != project_id:
        raise NotFoundException(f"Member {member_id} not found in project {project_id}")
    return await service.db.update_project_member(
        member_id=member_id,
        role=role,
        permissions=permissions,
        status=status,
    )


async def delete_project_member(
    service,
    project_id: str,
    member_id: str,
    user_id: str,
):
    await service.check_project_permission(project_id, user_id, "can_manage")
    member = await service.db.get_project_member(member_id)
    if not member or member.projectId != project_id:
        raise NotFoundException(f"Member {member_id} not found in project {project_id}")

    project = await service.db.get_project(project_id)
    if member.userId == project.userId:
        raise ValidationException("Cannot delete project owner")

    return await service.db.delete_project_member(member_id)
