from __future__ import annotations

from schemas.chat import SendMessageRequest
from schemas.studio_cards import (
    RefineMode,
    StudioCardExecutionPreviewRequest,
    StudioCardRefineRequest,
    StudioCardTurnRequest,
)
from services.chat import resolve_effective_rag_source_ids
from services.generation_session_service.card_execution_preview import (
    build_studio_card_execution_preview,
)
from utils.exceptions import APIException, ErrorCode, NotFoundException

from .studio_card_refine_helpers import build_chat_refine_metadata


def _resolve_request_rag_source_ids(body: dict) -> list[str] | None:
    return resolve_effective_rag_source_ids(
        rag_source_ids=body.get("rag_source_ids"),
        metadata=body,
    )


def require_body_field(body: dict, field_name: str, *, message: str) -> str:
    value = body.get(field_name)
    if value:
        return value
    raise APIException(
        status_code=400,
        error_code=ErrorCode.INVALID_INPUT,
        message=message,
    )


def require_project_id(body: dict) -> str:
    return require_body_field(body, "project_id", message="project_id 为必填字段")


def build_preview_or_raise(card_id: str, body: dict):
    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=body.get("project_id"),
        config=body.get("config"),
        template_config=body.get("template_config"),
        visibility=body.get("visibility"),
        source_artifact_id=body.get("source_artifact_id"),
        rag_source_ids=_resolve_request_rag_source_ids(body),
    )
    if preview is None:
        raise NotFoundException(
            message="Studio 卡片不存在",
            error_code=ErrorCode.NOT_FOUND,
        )
    return preview


def build_execution_request(
    *,
    project_id: str,
    body: dict,
) -> StudioCardExecutionPreviewRequest:
    return StudioCardExecutionPreviewRequest(
        project_id=project_id,
        config=body.get("config") or {},
        template_config=body.get("template_config"),
        visibility=body.get("visibility"),
        source_artifact_id=body.get("source_artifact_id"),
        rag_source_ids=_resolve_request_rag_source_ids(body),
        client_session_id=body.get("client_session_id"),
        run_id=body.get("run_id"),
    )


def build_refine_request(
    *,
    project_id: str,
    body: dict,
) -> StudioCardRefineRequest:
    return StudioCardRefineRequest(
        project_id=project_id,
        artifact_id=body.get("artifact_id"),
        session_id=body.get("session_id"),
        message=str(body.get("message") or ""),
        refine_mode=RefineMode(str(body.get("refine_mode") or RefineMode.CHAT_REFINE.value)),
        selection_anchor=body.get("selection_anchor"),
        config=body.get("config") or {},
        visibility=body.get("visibility"),
        source_artifact_id=body.get("source_artifact_id"),
        rag_source_ids=_resolve_request_rag_source_ids(body),
    )


def build_chat_refine_request(
    *,
    card_id: str,
    project_id: str,
    body: dict,
    payload: dict,
) -> SendMessageRequest:
    return SendMessageRequest(
        project_id=project_id,
        session_id=body.get("session_id"),
        content=str(body.get("message") or ""),
        metadata=build_chat_refine_metadata(card_id, body, payload),
        rag_source_ids=_resolve_request_rag_source_ids(body),
    )


def build_turn_request(
    *,
    project_id: str,
    artifact_id: str,
    teacher_answer: str,
    body: dict,
) -> StudioCardTurnRequest:
    return StudioCardTurnRequest(
        project_id=project_id,
        artifact_id=artifact_id,
        teacher_answer=teacher_answer,
        config=body.get("config") or {},
        rag_source_ids=_resolve_request_rag_source_ids(body),
        turn_anchor=body.get("turn_anchor"),
    )
