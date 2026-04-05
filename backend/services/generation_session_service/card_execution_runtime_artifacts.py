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
from services.generation_session_service.event_store import append_event
from services.generation_session_service.session_history import build_run_trace_payload
from services.platform.generation_event_constants import GenerationEventType
from services.project_space_service import project_space_service
from utils.exceptions import APIException, ErrorCode

from .card_execution_runtime_helpers import (
    artifact_metadata_dict,
    artifact_result_payload,
    create_replacement_artifact,
    get_current_version_id,
    load_artifact_content,
    validate_simulator_turn_artifact,
    validate_source_artifact,
    validate_structured_refine_artifact,
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
    execution_session_id = await _resolve_execution_session_id(
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
    await _promote_requested_run_to_generating(
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
    if (
        card_id == "word_document"
        and source_artifact_id
        and hasattr(project_space_service.db, "update_artifact_metadata")
    ):
        try:
            current_metadata = artifact_metadata_dict(artifact)
            await project_space_service.db.update_artifact_metadata(
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
    run = await _create_artifact_run(
        card_id=card_id,
        body=body,
        artifact=artifact,
        session_id=execution_session_id,
    )
    current_version_id = await get_current_version_id(body.project_id)
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.ARTIFACT_CREATE,
        resource_kind=StudioCardExecutionResultKind.ARTIFACT,
        session=(
            {"session_id": execution_session_id} if execution_session_id else None
        ),
        artifact=artifact_result_payload(
            artifact,
            current_version_id=current_version_id,
        ),
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
    run = await _create_artifact_run(
        card_id=card_id,
        body=body,
        artifact=new_artifact,
        session_id=getattr(new_artifact, "sessionId", None) or body.session_id,
    )
    current_version_id = await get_current_version_id(body.project_id)
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
        artifact=artifact_result_payload(
            new_artifact,
            current_version_id=current_version_id,
        ),
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
    current_version_id = await get_current_version_id(body.project_id)
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
        artifact_result_payload(
            new_artifact,
            current_version_id=current_version_id,
        ),
        StudioCardTurnResult(**normalized_turn_result),
    )


async def _create_artifact_run(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    artifact,
    session_id: str | None = None,
):
    from services.generation_session_service.session_history import (
        RUN_STATUS_COMPLETED,
        RUN_STATUS_PENDING,
        RUN_STATUS_PROCESSING,
        RUN_STEP_COMPLETED,
        RUN_STEP_GENERATE,
        RUN_STEP_OUTLINE,
        create_session_run,
        generate_semantic_run_title,
        serialize_session_run,
        spawn_background_task,
        update_session_run,
    )

    requested_run_id = str(getattr(body, "run_id", None) or "").strip()
    if requested_run_id:
        run = await _load_valid_studio_card_run(
            card_id=card_id,
            run_id=requested_run_id,
            project_id=body.project_id,
            expected_session_id=getattr(artifact, "sessionId", None) or session_id,
        )
    else:
        run = await create_session_run(
            db=project_space_service.db.db,
            session_id=getattr(artifact, "sessionId", None) or session_id,
            project_id=body.project_id,
            tool_type=f"studio_card:{card_id}",
            step=RUN_STEP_OUTLINE,
            status=RUN_STATUS_PENDING,
        )
    run_for_response = run
    if run:
        generating_run = await update_session_run(
            db=project_space_service.db.db,
            run_id=run.id,
            status=RUN_STATUS_PROCESSING,
            step=RUN_STEP_GENERATE,
        )
        if generating_run:
            run_for_response = generating_run
        finalized_run = await update_session_run(
            db=project_space_service.db.db,
            run_id=run.id,
            status=RUN_STATUS_COMPLETED,
            step=RUN_STEP_COMPLETED,
            artifact_id=artifact.id,
        )
        if finalized_run:
            run_for_response = finalized_run
        if hasattr(project_space_service.db, "update_artifact_metadata"):
            current_metadata = (
                getattr(artifact, "metadata", None)
                if isinstance(getattr(artifact, "metadata", None), dict)
                else {}
            )
            run_id = getattr(run_for_response, "id", None) or getattr(run, "id", None)
            run_no = getattr(run_for_response, "runNo", None) or getattr(
                run, "runNo", None
            )
            run_title = getattr(run_for_response, "title", None) or getattr(
                run, "title", None
            )
            tool_type = getattr(run_for_response, "toolType", None) or getattr(
                run, "toolType", None
            )
            await project_space_service.db.update_artifact_metadata(
                artifact.id,
                {
                    **current_metadata,
                    "run_id": run_id,
                    "run_no": run_no,
                    "run_title": run_title,
                    "tool_type": tool_type,
                },
            )
        spawn_background_task(
            generate_semantic_run_title(
                db=project_space_service.db.db,
                run_id=run.id,
                tool_type=run.toolType,
                snapshot=body.config,
            ),
            label=f"studio-card-run:{run.id}",
        )
    await _append_card_execution_completed_event(
        card_id=card_id,
        session_id=getattr(artifact, "sessionId", None) or session_id,
        artifact=artifact,
        run=run_for_response,
    )
    return serialize_session_run(run_for_response)


async def _load_valid_studio_card_run(
    *,
    card_id: str,
    run_id: str,
    project_id: str,
    expected_session_id: str | None,
):
    run_model = getattr(project_space_service.db.db, "sessionrun", None)
    existing_run = (
        await run_model.find_unique(where={"id": run_id})
        if run_model is not None and hasattr(run_model, "find_unique")
        else None
    )
    if (
        not existing_run
        or getattr(existing_run, "projectId", None) != project_id
        or getattr(existing_run, "toolType", None) != f"studio_card:{card_id}"
        or (
            expected_session_id
            and getattr(existing_run, "sessionId", None) != expected_session_id
        )
    ):
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="run_id 无效或不属于当前会话，请重新创建草稿。",
        )
    return existing_run


async def _promote_requested_run_to_generating(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    session_id: str | None,
) -> None:
    from services.generation_session_service.session_history import (
        RUN_STATUS_PROCESSING,
        RUN_STEP_GENERATE,
        update_session_run,
    )

    requested_run_id = str(getattr(body, "run_id", None) or "").strip()
    if not requested_run_id:
        return

    run = await _load_valid_studio_card_run(
        card_id=card_id,
        run_id=requested_run_id,
        project_id=body.project_id,
        expected_session_id=session_id,
    )
    await update_session_run(
        db=project_space_service.db.db,
        run_id=run.id,
        status=RUN_STATUS_PROCESSING,
        step=RUN_STEP_GENERATE,
    )


async def _resolve_execution_session_id(
    *,
    project_id: str,
    user_id: str,
    client_session_id: str | None,
) -> str | None:
    normalized = str(client_session_id or "").strip()
    if not normalized:
        return None

    db_handle = getattr(project_space_service.db, "db", None)
    if db_handle is None:
        return normalized
    session_model = getattr(db_handle, "generationsession", None)
    if session_model is None or not hasattr(session_model, "find_first"):
        return normalized

    session = await session_model.find_first(
        where={
            "projectId": project_id,
            "userId": user_id,
            "OR": [
                {"id": normalized},
                {"clientSessionId": normalized},
            ],
        }
    )
    if not session:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="client_session_id 无效或不属于当前项目",
        )
    return getattr(session, "id", None) or normalized


async def _append_card_execution_completed_event(
    *,
    card_id: str,
    session_id: str | None,
    artifact,
    run,
) -> None:
    if not session_id:
        return

    db_handle = getattr(project_space_service.db, "db", None)
    if db_handle is None:
        return

    session_model = getattr(db_handle, "generationsession", None)
    event_model = getattr(db_handle, "sessionevent", None)
    if session_model is None or event_model is None:
        return
    if not hasattr(session_model, "find_unique") or not hasattr(event_model, "create"):
        return

    try:
        session = await session_model.find_unique(where={"id": session_id})
    except Exception as exc:
        logger.warning(
            "Skip studio-card completion event due to session lookup error: %s", exc
        )
        return
    if not session:
        return

    payload = {
        "stage": "studio_card_execute",
        "card_id": card_id,
        "artifact_id": getattr(artifact, "id", None),
        "artifact_type": getattr(artifact, "type", None),
        "run_trace": build_run_trace_payload(run),
    }

    try:
        await append_event(
            db=db_handle,
            schema_version=1,
            session_id=session_id,
            event_type=GenerationEventType.TASK_COMPLETED.value,
            state=getattr(session, "state", None),
            state_reason=getattr(session, "stateReason", None),
            progress=getattr(session, "progress", None),
            payload=payload,
        )
    except Exception as exc:
        logger.warning("Skip studio-card completion event persistence failure: %s", exc)
