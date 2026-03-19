from __future__ import annotations

from services.database import db_service
from utils.exceptions import ForbiddenException, NotFoundException


async def get_owned_project(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project:
        raise NotFoundException(message=f"项目不存在: {project_id}")
    if project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


async def get_owned_file(file_id: str, user_id: str):
    file = await db_service.get_file(file_id)
    if not file:
        raise NotFoundException(message=f"文件不存在: {file_id}")

    await get_owned_project(file.projectId, user_id)
    return file
