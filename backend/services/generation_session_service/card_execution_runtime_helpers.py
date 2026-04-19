from __future__ import annotations

import json

from services.database import db_service
from schemas.project_space import ArtifactType
from schemas.studio_cards import ExecutionCarrier, RefineMode
from services.project_space_service import project_space_service
from utils.docx_content_sidecar import load_docx_content_sidecar
from utils.exceptions import APIException, ErrorCode

from .card_source_bindings import (
    get_card_source_artifact_types,
    is_card_source_optional,
)

STRUCTURED_REFINE_ARTIFACT_TYPES = {
    "word_document": ArtifactType.DOCX.value,
    "knowledge_mindmap": ArtifactType.MINDMAP.value,
    "interactive_quick_quiz": ArtifactType.EXERCISE.value,
    "interactive_games": ArtifactType.HTML.value,
    "demonstration_animations": "animation_media",
    "speaker_notes": ArtifactType.SUMMARY.value,
}

STRUCTURED_REFINE_KINDS = {
    "word_document": "word_document",
    "knowledge_mindmap": "mindmap",
    "interactive_quick_quiz": "quiz",
    "interactive_games": "interactive_game",
    "demonstration_animations": "animation_storyboard",
    "speaker_notes": "speaker_notes",
}

CARD_EXECUTION_CARRIERS = {
    "courseware_ppt": ExecutionCarrier.HYBRID,
    "word_document": ExecutionCarrier.HYBRID,
    "speaker_notes": ExecutionCarrier.HYBRID,
    "classroom_qa_simulator": ExecutionCarrier.HYBRID,
    "interactive_quick_quiz": ExecutionCarrier.ARTIFACT,
    "knowledge_mindmap": ExecutionCarrier.ARTIFACT,
    "interactive_games": ExecutionCarrier.ARTIFACT,
    "demonstration_animations": ExecutionCarrier.ARTIFACT,
}


def supports_structured_refine(card_id: str) -> bool:
    return card_id in STRUCTURED_REFINE_ARTIFACT_TYPES


def _is_animation_artifact_type(artifact_type: str | None) -> bool:
    return artifact_type in {ArtifactType.GIF.value, ArtifactType.MP4.value}


def artifact_result_payload(
    artifact,
    *,
    current_version_id: str | None = None,
) -> dict:
    metadata = artifact_metadata_dict(artifact)
    based_on_version_id = getattr(artifact, "basedOnVersionId", None)
    return {
        "id": getattr(artifact, "id", None),
        "project_id": getattr(artifact, "projectId", None),
        "session_id": getattr(artifact, "sessionId", None),
        "based_on_version_id": based_on_version_id,
        "current_version_id": current_version_id,
        "upstream_updated": bool(
            based_on_version_id
            and current_version_id
            and based_on_version_id != current_version_id
        ),
        "owner_user_id": getattr(artifact, "ownerUserId", None),
        "type": getattr(artifact, "type", None),
        "visibility": getattr(artifact, "visibility", None),
        "storage_path": getattr(artifact, "storagePath", None),
        "created_at": getattr(artifact, "createdAt", None),
        "updated_at": getattr(artifact, "updatedAt", None),
        "title": metadata.get("title"),
        "kind": metadata.get("kind"),
        "replaces_artifact_id": metadata.get("replaces_artifact_id"),
        "superseded_by_artifact_id": metadata.get("superseded_by_artifact_id"),
    }


def artifact_metadata_dict(artifact) -> dict:
    metadata = getattr(artifact, "metadata", None)
    if isinstance(metadata, dict):
        return dict(metadata)
    if isinstance(metadata, str) and metadata.strip():
        try:
            parsed = json.loads(metadata)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def _safe_parse_json_object(value) -> dict:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


async def resolve_effective_source_artifact_id(
    *,
    project_id: str,
    primary_source_id: str | None = None,
    source_artifact_id: str | None = None,
) -> str | None:
    normalized_artifact_id = str(source_artifact_id or "").strip()
    if normalized_artifact_id:
        return normalized_artifact_id

    normalized_primary_source_id = str(primary_source_id or "").strip()
    if not normalized_primary_source_id:
        return None

    upload = await db_service.get_file(normalized_primary_source_id)
    if upload and getattr(upload, "projectId", None) == project_id:
        parse_result = _safe_parse_json_object(getattr(upload, "parseResult", None))
        bridged_artifact_id = str(parse_result.get("artifact_id") or "").strip()
        if bridged_artifact_id:
            return bridged_artifact_id

    return normalized_primary_source_id


async def build_source_snapshot_payload(
    *,
    project_id: str,
    primary_source_id: str | None = None,
    selected_source_ids: list[str] | None = None,
    source_artifact_id: str | None = None,
) -> dict:
    normalized_primary_source_id = str(primary_source_id or "").strip() or None
    normalized_selected_source_ids = [
        str(item).strip()
        for item in (selected_source_ids or [])
        if isinstance(item, str) and str(item).strip()
    ]
    resolved_source_artifact_id = await resolve_effective_source_artifact_id(
        project_id=project_id,
        primary_source_id=normalized_primary_source_id,
        source_artifact_id=source_artifact_id,
    )

    snapshot = {
        "primary_source_id": normalized_primary_source_id,
        "selected_source_ids": normalized_selected_source_ids,
        "source_artifact_id": resolved_source_artifact_id,
    }

    if normalized_primary_source_id:
        if (
            resolved_source_artifact_id
            and normalized_primary_source_id == resolved_source_artifact_id
        ):
            return snapshot
        upload = await db_service.get_file(normalized_primary_source_id)
        if upload and getattr(upload, "projectId", None) == project_id:
            parse_result = _safe_parse_json_object(getattr(upload, "parseResult", None))
            snapshot.update(
                {
                    "primary_source_title": str(
                        parse_result.get("artifact_title")
                        or parse_result.get("title")
                        or getattr(upload, "filename", "")
                        or ""
                    ).strip()
                    or None,
                    "primary_source_tool_type": str(
                        parse_result.get("tool_type") or ""
                    ).strip()
                    or None,
                    "primary_source_surface_kind": str(
                        parse_result.get("surface_kind") or ""
                    ).strip()
                    or None,
                }
            )
    return snapshot


async def validate_source_artifact(
    *,
    project_id: str,
    card_id: str,
    user_id: str,
    source_artifact_id: str | None,
) -> None:
    allowed_types = get_card_source_artifact_types(card_id)
    if source_artifact_id:
        artifact = await project_space_service.get_artifact(
            source_artifact_id,
            user_id=user_id,
        )
        if not artifact or artifact.projectId != project_id:
            raise APIException(
                status_code=404,
                error_code=ErrorCode.NOT_FOUND,
                message="源成果不存在",
            )
        if allowed_types and artifact.type not in allowed_types:
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="源成果类型与当前卡片不匹配",
            )
        return

    if allowed_types and not is_card_source_optional(card_id):
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"{card_id} 需要提供 source_artifact_id",
        )


async def load_artifact_content(artifact) -> dict:
    artifact_type = str(getattr(artifact, "type", None) or "").strip().lower()
    if _is_animation_artifact_type(getattr(artifact, "type", None)):
        metadata = artifact_metadata_dict(artifact)
        snapshot = metadata.get("content_snapshot")
        if isinstance(snapshot, dict):
            return snapshot
        render_spec = metadata.get("render_spec")
        scenes = []
        if isinstance(render_spec, dict):
            raw_scenes = render_spec.get("scenes")
            if isinstance(raw_scenes, list):
                scenes = [dict(item) for item in raw_scenes if isinstance(item, dict)]
        return {
            "kind": "animation_storyboard",
            "format": (
                str(metadata.get("format") or getattr(artifact, "type", None) or "gif")
                .strip()
                .lower()
                or "gif"
            ),
            "title": str(metadata.get("title") or "教学动画").strip(),
            "summary": str(metadata.get("summary") or "").strip(),
            "topic": str(metadata.get("topic") or "").strip(),
            "scene": str(metadata.get("scene") or "").strip(),
            "duration_seconds": metadata.get("duration_seconds") or 6,
            "rhythm": str(metadata.get("rhythm") or "balanced").strip() or "balanced",
            "focus": str(metadata.get("focus") or "").strip(),
            "visual_type": str(metadata.get("visual_type") or "").strip(),
            "scenes": scenes,
            "render_spec": render_spec if isinstance(render_spec, dict) else {},
            "placements": list(metadata.get("placements") or []),
            "render_mode": (
                str(metadata.get("render_mode") or "gif").strip().lower() or "gif"
            ),
            "cloud_video_provider": str(
                metadata.get("cloud_video_provider") or ""
            ).strip(),
            "cloud_video_prompt": str(metadata.get("cloud_video_prompt") or "").strip(),
        }
    storage_path = getattr(artifact, "storagePath", None)
    if not storage_path:
        return {}
    if artifact_type == ArtifactType.DOCX.value:
        return load_docx_content_sidecar(storage_path)
    with open(storage_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


async def get_current_version_id(project_id: str) -> str | None:
    project = await project_space_service.db.get_project(project_id)
    return getattr(project, "currentVersionId", None) if project else None


async def create_replacement_artifact(
    *,
    source_artifact,
    project_id: str,
    user_id: str,
    content: dict,
):
    return await project_space_service.create_artifact_with_file(
        project_id=project_id,
        artifact_type=source_artifact.type,
        visibility=source_artifact.visibility,
        user_id=user_id,
        session_id=getattr(source_artifact, "sessionId", None),
        based_on_version_id=getattr(source_artifact, "basedOnVersionId", None),
        content=content,
        artifact_mode="replace",
    )


def build_source_binding_payload(
    *,
    card_id: str,
    source_artifact_id: str | None,
    accepted_types: tuple[str, ...] = (),
) -> dict:
    required = bool(accepted_types and not is_card_source_optional(card_id))
    selected_ids = [source_artifact_id] if source_artifact_id else []
    return {
        "required": required,
        "mode": "single_artifact" if accepted_types else "none",
        "accepted_types": list(accepted_types),
        "selected_ids": selected_ids,
        "visibility_scope": "project-visible" if selected_ids else None,
        "status": "bound" if selected_ids else ("required_missing" if required else "optional"),
    }


def build_provenance_payload(
    *,
    card_id: str,
    artifact_id: str | None = None,
    session_id: str | None = None,
    source_artifact_id: str | None = None,
    request_snapshot: dict | None = None,
    replaces_artifact_id: str | None = None,
) -> dict:
    return {
        "card_id": card_id,
        "execution_carrier": CARD_EXECUTION_CARRIERS.get(card_id, ExecutionCarrier.ARTIFACT).value,
        "created_from_session_id": session_id,
        "created_from_artifact_ids": [source_artifact_id] if source_artifact_id else [],
        "request_snapshot": request_snapshot or {},
        "artifact_id": artifact_id,
        "replaces_artifact_id": replaces_artifact_id,
    }


def build_latest_runnable_state(
    *,
    card_id: str,
    artifact_id: str | None,
    session_id: str | None,
    source_binding_valid: bool,
    refine_mode: RefineMode | None = None,
) -> dict:
    carrier = CARD_EXECUTION_CARRIERS.get(card_id, ExecutionCarrier.ARTIFACT).value
    if card_id == "classroom_qa_simulator":
        next_action = "follow_up_turn"
    elif card_id == "demonstration_animations" and artifact_id:
        next_action = "placement"
    elif card_id == "interactive_quick_quiz" and (artifact_id or session_id):
        next_action = "answer_or_refine"
    elif artifact_id or session_id:
        next_action = "refine"
    else:
        next_action = "execute"
    return {
        "primary_carrier": carrier,
        "active_artifact_id": artifact_id,
        "active_session_id": session_id,
        "can_refine": bool(artifact_id or session_id),
        "can_follow_up_turn": card_id == "classroom_qa_simulator",
        "can_recommend_placement": card_id == "demonstration_animations" and bool(artifact_id),
        "can_confirm_placement": (
            card_id == "demonstration_animations"
            and bool(artifact_id)
            and source_binding_valid
        ),
        "source_binding_valid": source_binding_valid,
        "next_action": next_action,
    }


async def validate_structured_refine_artifact(
    *,
    card_id: str,
    project_id: str,
    user_id: str,
    artifact_id: str,
):
    artifact = await project_space_service.get_artifact(
        artifact_id,
        user_id=user_id,
    )
    if not artifact or artifact.projectId != project_id:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="待 refine 的成果不存在",
        )

    expected_type = STRUCTURED_REFINE_ARTIFACT_TYPES.get(card_id)
    if card_id == "demonstration_animations":
        type_matches = _is_animation_artifact_type(getattr(artifact, "type", None))
    else:
        type_matches = artifact.type == expected_type
    if not type_matches:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前成果类型与卡片 refine 协议不匹配",
        )

    expected_kind = STRUCTURED_REFINE_KINDS[card_id]
    artifact_kind = str(artifact_metadata_dict(artifact).get("kind") or "").strip()
    if artifact_kind and artifact_kind != expected_kind:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前成果 kind 与卡片 refine 协议不匹配",
        )
    return artifact


async def validate_simulator_turn_artifact(
    *,
    project_id: str,
    user_id: str,
    artifact_id: str,
):
    artifact = await project_space_service.get_artifact(
        artifact_id,
        user_id=user_id,
    )
    if not artifact or artifact.projectId != project_id:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="课堂问答模拟成果不存在",
        )
    if artifact.type != ArtifactType.SUMMARY.value:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="仅支持基于 summary artifact 推进课堂问答模拟",
        )
    artifact_kind = str(artifact_metadata_dict(artifact).get("kind") or "").strip()
    if artifact_kind != "classroom_qa_simulator":
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前成果不是 classroom_qa_simulator 类型",
        )
    return artifact
