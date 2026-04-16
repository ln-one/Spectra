import logging
from typing import Optional

from fastapi.encoders import jsonable_encoder

from schemas.project_semantics import (
    is_project_referenceable,
    normalize_project_reference_mode,
)
from schemas.project_space import ReferenceRelationType
from schemas.project_vocabulary import ProjectReferenceMode
from services.application.access import get_owned_project
from services.database import db_service
from services.file_upload_service import serialize_upload
from services.project_space_service.service import project_space_service
from utils.exceptions import InternalServerException, ValidationException
from utils.responses import success_response

logger = logging.getLogger(__name__)


async def _bootstrap_default_session(project_id: str, user_id: str) -> None:
    from services.generation_session_service import GenerationSessionService

    session_service = GenerationSessionService(db=db_service.db)
    await session_service.create_session(
        project_id=project_id,
        user_id=user_id,
        output_type="both",
        bootstrap_only=True,
    )
    logger.info(
        "project_default_session_created",
        extra={"user_id": user_id, "project_id": project_id},
    )


async def _create_formal_project(project, user_id: str) -> None:
    await project_space_service.create_managed_project(
        project_id=project.id,
        user_id=user_id,
        name=project.name,
        description=getattr(project, "description", None),
        visibility=getattr(project, "visibility", None) or "private",
        is_referenceable=bool(getattr(project, "isReferenceable", False)),
    )


async def _delete_formal_project(project_id: str, user_id: str) -> None:
    await project_space_service.delete_project(project_id=project_id, user_id=user_id)


async def _create_base_reference_if_needed(project, body, user_id: str) -> None:
    base_project_id = getattr(body, "base_project_id", None)
    if not base_project_id:
        return

    base_project = await db_service.get_project(base_project_id)
    if not base_project:
        raise ValidationException(message=f"基底项目不存在: {base_project_id}")
    if not is_project_referenceable(base_project):
        raise ValidationException(
            message="所选基底项目当前不可引用，请选择标记为“可引用”的项目。"
        )

    reference_mode = normalize_project_reference_mode(
        getattr(body, "reference_mode", ProjectReferenceMode.FOLLOW)
    )
    pinned_version_id = None
    if reference_mode.value == ProjectReferenceMode.PINNED.value:
        pinned_version_id = getattr(base_project, "currentVersionId", None)
        if not pinned_version_id:
            raise ValidationException(
                message="reference_mode=pinned 时，基底项目必须存在 current_version_id"
            )

    await project_space_service.create_project_reference(
        project_id=project.id,
        target_project_id=base_project_id,
        relation_type=ReferenceRelationType.BASE.value,
        mode=reference_mode.value,
        pinned_version_id=pinned_version_id,
        priority=0,
        user_id=user_id,
    )


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
    formal_project_created = False
    try:
        await _create_formal_project(new_project, user_id)
        formal_project_created = True
        await _create_base_reference_if_needed(new_project, project, user_id)
        await _bootstrap_default_session(new_project.id, user_id)
    except Exception:
        if formal_project_created:
            try:
                await _delete_formal_project(new_project.id, user_id)
            except Exception:
                logger.error(
                    "project_formal_state_rollback_failed",
                    extra={"user_id": user_id, "project_id": new_project.id},
                    exc_info=True,
                )
        await db_service.delete_project(new_project.id)
        logger.error(
            "project_create_orchestration_failed",
            extra={"user_id": user_id, "project_id": new_project.id},
            exc_info=True,
        )
        raise

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
    existing_project = await get_owned_project(project_id, user_id)

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
    try:
        await project_space_service.update_project_governance(
            project_id=project_id,
            user_id=user_id,
            description=body.description,
            visibility=body.visibility,
            is_referenceable=body.is_referenceable,
        )
    except Exception:
        await db_service.update_project(
            project_id=project_id,
            name=getattr(existing_project, "name", None),
            description=getattr(existing_project, "description", None),
            grade_level=getattr(existing_project, "gradeLevel", None),
            visibility=getattr(existing_project, "visibility", None),
            is_referenceable=getattr(existing_project, "isReferenceable", None),
        )
        logger.error(
            "project_update_failed",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "update_stage": "formal_governance",
            },
            exc_info=True,
        )
        raise
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


async def delete_project_response(project_id: str, user_id: str):
    await get_owned_project(project_id, user_id)

    logger.info(
        "project_delete_started",
        extra={"user_id": user_id, "project_id": project_id},
    )

    try:
        await _delete_formal_project(project_id, user_id)
    except Exception:
        logger.error(
            "project_delete_failed",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "delete_stage": "formal",
            },
            exc_info=True,
        )
        raise

    try:
        await db_service.delete_project(project_id)
    except Exception as exc:
        logger.error(
            "project_delete_failed",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "delete_stage": "database",
            },
            exc_info=True,
        )
        raise InternalServerException(
            message="删除项目失败",
            details={"project_id": project_id, "stage": "database"},
        ) from exc

    logger.info(
        "project_deleted",
        extra={"user_id": user_id, "project_id": project_id},
    )
    return success_response(data={}, message="项目删除成功")


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
