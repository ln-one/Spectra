import logging
import json
from typing import Any, Optional

from fastapi.encoders import jsonable_encoder

from schemas.projects import ArtifactBackedSourceItem
from schemas.project_semantics import (
    is_project_referenceable,
    normalize_project_reference_mode,
)
from schemas.project_space import ReferenceRelationType
from schemas.project_vocabulary import ProjectReferenceMode
from services.application.access import get_owned_project
from services.database import db_service
from services.file_upload_service import serialize_upload
from services.library_semantics import (
    ARTIFACT_SOURCE_USAGE_INTENT,
    SILENT_ACCRETION_USAGE_INTENT,
)
from services.project_space_service.artifact_accretion import silently_accrete_artifact
from services.project_space_service.artifact_modes import parse_artifact_metadata
from services.project_space_service.service import project_space_service
from services.title_service import request_project_title_generation
from services.generation_session_service.run_constants import (
    PROJECT_TITLE_SOURCE_DEFAULT,
    PROJECT_TITLE_SOURCE_MANUAL,
    build_numbered_default_project_title,
)
from utils.exceptions import InternalServerException, ValidationException
from utils.responses import success_response

logger = logging.getLogger(__name__)

_ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE = {
    "pptx": "ppt",
    "docx": "word",
    "mindmap": "mindmap",
}
_ARTIFACT_SOURCE_SURFACE_KIND_BY_ARTIFACT_TYPE = {
    "pptx": "slides",
    "docx": "document",
    "mindmap": "graph",
}
_SUPPORTED_ARTIFACT_SOURCE_TYPES = set(
    _ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE.keys()
)


def _safe_parse_json_object(value: Any) -> Optional[dict]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid parseResult JSON while serializing artifact source")
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _read_field(record: Any, field_name: str):
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


def _serialize_artifact_source_item(upload: Any) -> ArtifactBackedSourceItem:
    parse_result = _safe_parse_json_object(_read_field(upload, "parseResult")) or {}
    artifact_type = str(parse_result.get("artifact_type") or "").strip().lower()
    title = (
        str(parse_result.get("artifact_title") or "").strip()
        or str(_read_field(upload, "filename") or "").strip()
        or "未命名成果"
    )
    return ArtifactBackedSourceItem(
        id=str(_read_field(upload, "id") or ""),
        artifact_id=str(parse_result.get("artifact_id") or ""),
        artifact_type=artifact_type,
        tool_type=(
            str(parse_result.get("tool_type") or "").strip()
            or _ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE.get(artifact_type, "summary")
        ),
        title=title,
        surface_kind=(
            str(parse_result.get("surface_kind") or "").strip() or None
        ),
        filename=str(_read_field(upload, "filename") or "").strip() or None,
        session_id=str(parse_result.get("session_id") or "").strip() or None,
        created_at=_read_field(upload, "createdAt"),
        updated_at=_read_field(upload, "updatedAt"),
    )


async def _resolve_next_default_project_title(user_id: str) -> str:
    count_projects = getattr(db_service, "count_projects_by_user", None)
    if not callable(count_projects):
        return build_numbered_default_project_title(1)
    existing_count = await count_projects(user_id)
    return build_numbered_default_project_title(int(existing_count) + 1)


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


async def list_artifact_sources_response(project_id: str, user_id: str):
    await get_owned_project(project_id, user_id)
    uploads = await db_service.get_project_artifact_source_uploads(project_id)
    sources = [_serialize_artifact_source_item(upload) for upload in uploads or []]
    return success_response(
        data={"sources": [item.model_dump(mode="json") for item in sources]},
        message="获取项目沉淀来源成功",
    )


async def create_artifact_source_response(
    project_id: str,
    artifact_id: str,
    *,
    surface_kind: Optional[str],
    user_id: str,
):
    await get_owned_project(project_id, user_id)
    artifact = await project_space_service.get_artifact(artifact_id, user_id=user_id)
    if not artifact or getattr(artifact, "projectId", None) != project_id:
        raise ValidationException(message="目标成果不存在，无法加入来源。")

    artifact_type = str(getattr(artifact, "type", "") or "").strip().lower()
    if artifact_type not in _SUPPORTED_ARTIFACT_SOURCE_TYPES:
        raise ValidationException(message="当前仅支持 PPT、文档、导图加入来源。")

    artifact_metadata = parse_artifact_metadata(getattr(artifact, "metadata", None))
    artifact_title = (
        str(artifact_metadata.get("title") or "").strip()
        or str(getattr(artifact, "id", "") or "").strip()
    )
    resolved_surface_kind = (
        str(surface_kind or "").strip()
        or _ARTIFACT_SOURCE_SURFACE_KIND_BY_ARTIFACT_TYPE.get(artifact_type)
    )
    resolved_tool_type = _ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE[artifact_type]

    existing_upload = await db_service.find_artifact_accretion_upload(
        project_id, artifact_id
    )
    if existing_upload is not None:
        parse_result = _safe_parse_json_object(getattr(existing_upload, "parseResult", None)) or {}
        parse_result.update(
            {
                "artifact_id": artifact_id,
                "artifact_type": artifact_type,
                "artifact_title": artifact_title,
                "surface_kind": resolved_surface_kind,
                "tool_type": resolved_tool_type,
                "session_id": getattr(artifact, "sessionId", None),
            }
        )
        if getattr(existing_upload, "usageIntent", None) != ARTIFACT_SOURCE_USAGE_INTENT:
            await db_service.update_file_intent(
                getattr(existing_upload, "id"), ARTIFACT_SOURCE_USAGE_INTENT
            )
        await db_service.update_upload_status(
            getattr(existing_upload, "id"),
            status=str(getattr(existing_upload, "status", "ready") or "ready"),
            parse_result=parse_result,
            error_message=getattr(existing_upload, "errorMessage", None),
        )
        refreshed = await db_service.get_file(getattr(existing_upload, "id"))
        return success_response(
            data={
                "source": _serialize_artifact_source_item(refreshed).model_dump(
                    mode="json"
                )
            },
            message="已加入项目来源",
        )

    content_snapshot = artifact_metadata.get("content_snapshot")
    if not isinstance(content_snapshot, dict) or not content_snapshot:
        raise ValidationException(message="当前成果缺少可沉淀内容，暂时无法加入来源。")

    normalized_content = dict(content_snapshot)
    normalized_content.setdefault("title", artifact_title)
    upload = await silently_accrete_artifact(
        db=db_service,
        artifact=artifact,
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=str(getattr(artifact, "visibility", "private") or "private"),
        session_id=getattr(artifact, "sessionId", None),
        based_on_version_id=getattr(artifact, "basedOnVersionId", None),
        normalized_content=normalized_content,
        usage_intent=ARTIFACT_SOURCE_USAGE_INTENT,
    )
    parse_result = _safe_parse_json_object(getattr(upload, "parseResult", None)) or {}
    parse_result.update(
        {
            "artifact_title": artifact_title,
            "surface_kind": resolved_surface_kind,
            "tool_type": resolved_tool_type,
            "session_id": getattr(artifact, "sessionId", None),
        }
    )
    await db_service.update_upload_status(
        getattr(upload, "id"),
        status=str(getattr(upload, "status", "ready") or "ready"),
        parse_result=parse_result,
        error_message=getattr(upload, "errorMessage", None),
    )
    refreshed = await db_service.get_file(getattr(upload, "id"))
    return success_response(
        data={"source": _serialize_artifact_source_item(refreshed).model_dump(mode="json")},
        message="已加入项目来源",
    )


async def delete_artifact_source_response(project_id: str, source_id: str, user_id: str):
    await get_owned_project(project_id, user_id)
    upload = await db_service.get_file(source_id)
    if upload is None or getattr(upload, "projectId", None) != project_id:
        raise ValidationException(message="沉淀来源不存在。")
    if getattr(upload, "usageIntent", None) != ARTIFACT_SOURCE_USAGE_INTENT:
        raise ValidationException(message="目标来源不是项目沉淀来源。")

    await db_service.update_file_intent(source_id, SILENT_ACCRETION_USAGE_INTENT)
    return success_response(data={}, message="已移出项目来源")


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

    manual_name = str(getattr(project, "name", "") or "").strip()
    resolved_name = manual_name or await _resolve_next_default_project_title(user_id)
    name_source = (
        PROJECT_TITLE_SOURCE_MANUAL if manual_name else PROJECT_TITLE_SOURCE_DEFAULT
    )

    new_project = await db_service.create_project(
        project,
        user_id=user_id,
        name_override=resolved_name,
        name_source=name_source,
    )
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

    if name_source == PROJECT_TITLE_SOURCE_DEFAULT:
        try:
            await request_project_title_generation(
                db=db_service.db,
                project_id=new_project.id,
                description=str(getattr(project, "description", "") or ""),
            )
        except Exception:
            logger.warning(
                "project_title_generation_request_failed",
                extra={"user_id": user_id, "project_id": new_project.id},
                exc_info=True,
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
        name_source=PROJECT_TITLE_SOURCE_MANUAL,
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
            name_source=getattr(existing_project, "nameSource", None),
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
