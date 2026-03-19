import logging
from typing import Optional

from fastapi.encoders import jsonable_encoder

from services import db_service
from services.file_upload_service import serialize_upload
from utils.exceptions import ForbiddenException, NotFoundException
from utils.responses import success_response

logger = logging.getLogger(__name__)


async def get_owned_project(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project:
        raise NotFoundException(message=f"项目不存在: {project_id}")
    if project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


async def create_project_response(
    project, user_id: str, idempotency_key: Optional[str]
):
    cache_key = (
        f"projects:create:{user_id}:{idempotency_key}" if idempotency_key else None
    )
    if cache_key:
        cached_response = await db_service.get_idempotency_response(cache_key)
        if cached_response:
            logger.info(
                "idempotency_cache_hit",
                extra={"user_id": user_id, "idempotency_key": idempotency_key},
            )
            return cached_response

    new_project = await db_service.create_project(project, user_id=user_id)
    logger.info(
        "project_created",
        extra={"user_id": user_id, "project_id": new_project.id},
    )

    response_payload = success_response(
        data={"project": new_project}, message="项目创建成功"
    )
    if cache_key:
        await db_service.save_idempotency_response(
            cache_key, jsonable_encoder(response_payload)
        )
    return response_payload


async def update_project_response(
    project_id: str, body, user_id: str, idempotency_key: Optional[str]
):
    await get_owned_project(project_id, user_id)

    cache_key = (
        f"projects:update:{user_id}:{project_id}:{idempotency_key}"
        if idempotency_key
        else None
    )
    if cache_key:
        cached_response = await db_service.get_idempotency_response(cache_key)
        if cached_response:
            logger.info(
                "idempotency_cache_hit",
                extra={
                    "user_id": user_id,
                    "project_id": project_id,
                    "idempotency_key": idempotency_key,
                },
            )
            return cached_response

    updated = await db_service.update_project(
        project_id=project_id,
        name=body.name,
        description=body.description,
        grade_level=body.grade_level,
        visibility=body.visibility,
        is_referenceable=body.is_referenceable,
    )
    logger.info(
        "project_updated",
        extra={
            "user_id": user_id,
            "project_id": project_id,
            "idempotency_key": idempotency_key,
        },
    )

    response_payload = success_response(
        data={"project": updated}, message="项目更新成功"
    )
    if cache_key:
        await db_service.save_idempotency_response(
            cache_key, jsonable_encoder(response_payload)
        )
    return response_payload


async def get_project_files_response(
    project_id: str, user_id: str, page: int, limit: int
):
    await get_owned_project(project_id, user_id)
    files = await db_service.get_project_files(
        project_id=project_id,
        page=page,
        limit=limit,
    )
    files_payload = [serialize_upload(f) for f in files]
    total = await db_service.count_project_files(project_id=project_id)

    logger.info(
        "project_files_fetched",
        extra={
            "user_id": user_id,
            "project_id": project_id,
            "page": page,
            "limit": limit,
        },
    )

    return success_response(
        data={
            "files": files_payload,
            "total": total,
            "page": page,
            "limit": limit,
        },
        message="获取项目文件列表成功",
    )
