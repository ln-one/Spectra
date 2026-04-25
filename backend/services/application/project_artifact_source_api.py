import json
import logging
from typing import Any, Optional

from schemas.projects import ArtifactBackedSourceItem
from services.application.access import get_owned_project
from services.application.project_artifact_sources import (
    ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE,
    SUPPORTED_ARTIFACT_SOURCE_TYPES,
    resolve_artifact_source_surface_kind,
)
from services.database import db_service
from services.library_semantics import (
    ARTIFACT_SOURCE_USAGE_INTENT,
    SILENT_ACCRETION_USAGE_INTENT,
)
from services.project_space_service.artifact_accretion import silently_accrete_artifact
from services.project_space_service.artifact_modes import parse_artifact_metadata
from services.project_space_service.service import project_space_service
from utils.exceptions import ValidationException
from utils.responses import success_response

logger = logging.getLogger(__name__)


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
        source_kind="artifact_source",
        artifact_id=str(parse_result.get("artifact_id") or ""),
        artifact_type=artifact_type,
        tool_type=(
            str(parse_result.get("tool_type") or "").strip()
            or ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE.get(artifact_type, "summary")
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
    if artifact_type not in SUPPORTED_ARTIFACT_SOURCE_TYPES:
        raise ValidationException(message="当前仅支持 PPT、文档、导图加入来源。")

    artifact_metadata = parse_artifact_metadata(getattr(artifact, "metadata", None))
    artifact_title = (
        str(artifact_metadata.get("title") or "").strip()
        or str(getattr(artifact, "id", "") or "").strip()
    )
    resolved_surface_kind = resolve_artifact_source_surface_kind(
        artifact_type, artifact_metadata, surface_kind
    )
    resolved_tool_type = ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE[artifact_type]

    existing_upload = await db_service.find_artifact_accretion_upload(
        project_id, artifact_id
    )
    if existing_upload is not None:
        parse_result = (
            _safe_parse_json_object(getattr(existing_upload, "parseResult", None)) or {}
        )
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
