from __future__ import annotations

import logging
import re

from schemas.project_space import ProjectPermission
from schemas.studio_cards import (
    StudioCardExecutionPreviewRequest,
    StudioCardExecutionResult,
    StudioCardExecutionResultKind,
    StudioCardRefineRequest,
    StudioCardTransport,
    StudioCardTurnRequest,
    StudioCardTurnResult,
)
from services.project_space_service import project_space_service

from .card_execution_runtime_helpers import (
    artifact_metadata_dict,
    artifact_result_payload,
    create_replacement_artifact,
    load_artifact_content,
    validate_simulator_turn_artifact,
    validate_source_artifact,
    validate_structured_refine_artifact,
)
from .card_execution_runtime_run_helpers import (
    create_artifact_run,
    promote_requested_run_to_generating,
    resolve_execution_session_id,
)
from .tool_content_builder import (
    build_studio_simulator_turn_update,
    build_studio_tool_artifact_content,
)
from .tool_refine_builder import build_structured_refine_artifact_content


def _normalize_word_base_title(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\.(pptx?|docx?)$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"(课件|PPT)\s*$", "", text, flags=re.IGNORECASE).strip()
    return text[:120]


def _compose_word_title(base: str) -> str:
    normalized = _normalize_word_base_title(base)
    if not normalized:
        return "教学教案"
    if any(token in normalized for token in ("教案", "讲义", "文档", "逐字稿")):
        return normalized
    return f"{normalized}教案"


async def _resolve_word_document_title(
    *,
    source_artifact_id: str,
    config: dict | None,
    existing_title: str,
) -> str:
    if existing_title:
        return _compose_word_title(existing_title)

    source_id = str(source_artifact_id or "").strip()
    if source_id:
        try:
            source_artifact = await project_space_service.get_artifact(source_id)
            if source_artifact:
                source_metadata = artifact_metadata_dict(source_artifact)
                source_title = str(source_metadata.get("title") or "").strip()
                if source_title:
                    return _compose_word_title(source_title)
        except Exception as exc:
            logger.warning(
                "Resolve word title from source artifact failed: source=%s error=%s",
                source_id,
                exc,
            )

    topic = ""
    if isinstance(config, dict):
        topic = str(config.get("topic") or config.get("title") or "").strip()
    return _compose_word_title(topic)


async def execute_studio_card_artifact_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    preview,
) -> StudioCardExecutionResult:
    payload = dict(preview.initial_request.payload)
    execution_session_id = await resolve_execution_session_id(
        project_id=body.project_id,
        user_id=user_id,
        client_session_id=body.client_session_id,
    )
    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    await validate_source_artifact(
        project_id=body.project_id,
        card_id=card_id,
        source_artifact_id=body.source_artifact_id,
    )
    await promote_requested_run_to_generating(
        card_id=card_id,
        body=body,
        session_id=execution_session_id,
    )
    artifact_content = dict(payload.get("content") or {})
    generated_content = await build_studio_tool_artifact_content(
        card_id=card_id,
        project_id=body.project_id,
        config=body.config,
        source_artifact_id=body.source_artifact_id,
        rag_source_ids=body.rag_source_ids,
    )
    if generated_content:
        artifact_content.update(generated_content)
    source_artifact_id = str(
        body.source_artifact_id
        or artifact_content.get("source_artifact_id")
        or payload.get("source_artifact_id")
        or ""
    ).strip()
    if card_id == "word_document":
        artifact_content["title"] = await _resolve_word_document_title(
            source_artifact_id=source_artifact_id,
            config=(body.config if isinstance(body.config, dict) else {}),
            existing_title=str(artifact_content.get("title") or "").strip(),
        )

    artifact = await project_space_service.create_artifact_with_file(
        project_id=body.project_id,
        artifact_type=payload["type"],
        visibility=payload["visibility"],
        user_id=user_id,
        session_id=execution_session_id or payload.get("session_id"),
        based_on_version_id=payload.get("based_on_version_id"),
        content=artifact_content,
        artifact_mode="replace",
    )
    if card_id == "word_document" and source_artifact_id:
        try:
            current_metadata = artifact_metadata_dict(artifact)
            await project_space_service.update_artifact_metadata(
                artifact.id,
                {
                    **current_metadata,
                    "source_artifact_id": source_artifact_id,
                    "source_artifact_type": "pptx",
                },
            )
        except Exception as exc:
            logger.warning(
                "Skip word_document source metadata sync due to db error: %s", exc
            )
    run = await create_artifact_run(
        card_id=card_id,
        body=body,
        artifact=artifact,
        session_id=execution_session_id,
    )
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.ARTIFACT_CREATE,
        resource_kind=StudioCardExecutionResultKind.ARTIFACT,
        session=(
            {"session_id": execution_session_id} if execution_session_id else None
        ),
        artifact=artifact_result_payload(artifact),
        run=run,
        request_preview=preview.initial_request,
    )


logger = logging.getLogger(__name__)


async def execute_studio_card_structured_refine(
    *,
    card_id: str,
    body: StudioCardRefineRequest,
    user_id: str,
    preview,
    load_content=load_artifact_content,
) -> StudioCardExecutionResult:
    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    artifact = await validate_structured_refine_artifact(
        card_id=card_id,
        project_id=body.project_id,
        artifact_id=body.artifact_id,
    )
    current_content = await load_content(artifact)
    updated_content = await build_structured_refine_artifact_content(
        card_id=card_id,
        current_content=current_content,
        message=body.message,
        config=body.config,
        project_id=body.project_id,
        rag_source_ids=body.rag_source_ids,
    )
    new_artifact = await create_replacement_artifact(
        source_artifact=artifact,
        project_id=body.project_id,
        user_id=user_id,
        content=updated_content,
    )
    run = await create_artifact_run(
        card_id=card_id,
        body=body,
        artifact=new_artifact,
        session_id=getattr(new_artifact, "sessionId", None) or body.session_id,
    )
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.ARTIFACT_CREATE,
        resource_kind=StudioCardExecutionResultKind.ARTIFACT,
        session=(
            {"session_id": getattr(new_artifact, "sessionId", None) or body.session_id}
            if (getattr(new_artifact, "sessionId", None) or body.session_id)
            else None
        ),
        artifact=artifact_result_payload(new_artifact),
        run=run,
        request_preview=preview.refine_request,
    )


async def execute_classroom_simulator_turn_artifact(
    *,
    body: StudioCardTurnRequest,
    user_id: str,
    load_content=load_artifact_content,
) -> tuple[dict, StudioCardTurnResult]:
    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    artifact = await validate_simulator_turn_artifact(
        project_id=body.project_id,
        artifact_id=body.artifact_id,
    )
    current_content = await load_content(artifact)
    updated_content, turn_result = await build_studio_simulator_turn_update(
        current_content=current_content,
        teacher_answer=body.teacher_answer,
        config=body.config,
        project_id=body.project_id,
        rag_source_ids=body.rag_source_ids,
        turn_anchor=body.turn_anchor,
    )
    new_artifact = await create_replacement_artifact(
        source_artifact=artifact,
        project_id=body.project_id,
        user_id=user_id,
        content=updated_content,
    )
    normalized_turn_result = dict(turn_result or {})
    if not normalized_turn_result.get("student_profile"):
        normalized_turn_result["student_profile"] = str(
            normalized_turn_result.get("student_intent")
            or (body.config or {}).get("profile")
            or "detail_oriented"
        )
    if not normalized_turn_result.get("feedback"):
        normalized_turn_result["feedback"] = str(
            normalized_turn_result.get("assistant_feedback")
            or normalized_turn_result.get("analysis")
            or "建议继续追问边界条件与关键步骤。"
        )
    if not normalized_turn_result.get("teacher_answer"):
        normalized_turn_result["teacher_answer"] = body.teacher_answer
    if "score" not in normalized_turn_result:
        raw_score = normalized_turn_result.get("quality_score")
        try:
            normalized_turn_result["score"] = int(raw_score)
        except (TypeError, ValueError):
            normalized_turn_result["score"] = 80

    return (
        artifact_result_payload(new_artifact),
        StudioCardTurnResult(**normalized_turn_result),
    )


_create_artifact_run = create_artifact_run
