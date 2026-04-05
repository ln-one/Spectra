from __future__ import annotations

import json

from schemas.project_space import ArtifactType
from services.project_space_service import project_space_service
from utils.exceptions import APIException, ErrorCode

from .card_source_bindings import get_card_source_artifact_types

STRUCTURED_REFINE_ARTIFACT_TYPES = {
    "knowledge_mindmap": ArtifactType.MINDMAP.value,
    "interactive_quick_quiz": ArtifactType.EXERCISE.value,
    "interactive_games": ArtifactType.HTML.value,
    "speaker_notes": ArtifactType.SUMMARY.value,
}

STRUCTURED_REFINE_KINDS = {
    "knowledge_mindmap": "mindmap",
    "interactive_quick_quiz": "quiz",
    "interactive_games": "interactive_game",
    "speaker_notes": "speaker_notes",
}


def supports_structured_refine(card_id: str) -> bool:
    return card_id in STRUCTURED_REFINE_ARTIFACT_TYPES


def artifact_result_payload(
    artifact,
    *,
    current_version_id: str | None = None,
) -> dict:
    based_on_version_id = artifact.basedOnVersionId
    return {
        "id": artifact.id,
        "project_id": artifact.projectId,
        "session_id": artifact.sessionId,
        "based_on_version_id": based_on_version_id,
        "current_version_id": current_version_id,
        "upstream_updated": bool(
            based_on_version_id
            and current_version_id
            and based_on_version_id != current_version_id
        ),
        "owner_user_id": artifact.ownerUserId,
        "type": artifact.type,
        "visibility": artifact.visibility,
        "storage_path": artifact.storagePath,
        "created_at": artifact.createdAt,
        "updated_at": artifact.updatedAt,
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


async def validate_source_artifact(
    *,
    project_id: str,
    card_id: str,
    source_artifact_id: str | None,
) -> None:
    allowed_types = get_card_source_artifact_types(card_id)
    if source_artifact_id:
        artifact = await project_space_service.get_artifact(source_artifact_id)
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

    if allowed_types:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"{card_id} 需要提供 source_artifact_id",
        )


async def load_artifact_content(artifact) -> dict:
    storage_path = getattr(artifact, "storagePath", None)
    if not storage_path:
        return {}
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


async def validate_structured_refine_artifact(
    *,
    card_id: str,
    project_id: str,
    artifact_id: str,
):
    artifact = await project_space_service.get_artifact(artifact_id)
    if not artifact or artifact.projectId != project_id:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="待 refine 的成果不存在",
        )

    expected_type = STRUCTURED_REFINE_ARTIFACT_TYPES[card_id]
    if artifact.type != expected_type:
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
    artifact_id: str,
):
    artifact = await project_space_service.get_artifact(artifact_id)
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
