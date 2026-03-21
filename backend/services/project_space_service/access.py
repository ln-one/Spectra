from schemas.project_space import ProjectMemberStatus, ProjectPermission
from utils.exceptions import ForbiddenException, NotFoundException

from .permission_semantics import has_project_permission, normalize_project_permission


async def check_project_permission(
    service,
    project_id: str,
    user_id: str,
    permission: ProjectPermission | str = ProjectPermission.VIEW,
) -> bool:
    project = await service.db.get_project(project_id)
    if not project:
        raise NotFoundException(f"Project {project_id} not found")

    normalized_permission = normalize_project_permission(permission)

    if project.userId == user_id:
        return True

    member = await service.db.get_project_member_by_user(project_id, user_id)
    if (
        member
        and getattr(member, "status", None) == ProjectMemberStatus.ACTIVE.value
        and has_project_permission(member.permissions, normalized_permission)
    ):
        return True

    raise ForbiddenException(
        "User "
        f"{user_id} doesn't have {normalized_permission.value} permission "
        f"on project {project_id}"
    )


async def check_project_exists(service, project_id: str) -> bool:
    project = await service.db.get_project(project_id)
    if not project:
        raise NotFoundException(f"Project {project_id} not found")
    return True
