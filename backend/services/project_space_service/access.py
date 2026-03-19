import json

from utils.exceptions import ForbiddenException, NotFoundException


async def check_project_permission(
    service, project_id: str, user_id: str, permission: str = "can_view"
) -> bool:
    project = await service.db.get_project(project_id)
    if not project:
        raise NotFoundException(f"Project {project_id} not found")

    if project.userId == user_id:
        return True

    member = await service.db.get_project_member_by_user(project_id, user_id)
    if member:
        permissions = member.permissions
        if isinstance(permissions, str):
            try:
                permissions = json.loads(permissions) if permissions else {}
            except json.JSONDecodeError:
                permissions = {}
        if isinstance(permissions, dict) and permissions.get(permission, False):
            return True

    raise ForbiddenException(
        "User "
        f"{user_id} doesn't have {permission} permission on project {project_id}"
    )


async def check_project_exists(service, project_id: str) -> bool:
    project = await service.db.get_project(project_id)
    if not project:
        raise NotFoundException(f"Project {project_id} not found")
    return True
