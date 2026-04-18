from __future__ import annotations

import logging

from schemas.studio_cards import StudioCardExecutionPreviewRequest
from services.database import db_service
from services.generation_session_service.event_store import append_event
from services.generation_session_service.session_history import build_run_trace_payload
from services.platform.generation_event_constants import GenerationEventType
from utils.exceptions import APIException, ErrorCode

logger = logging.getLogger(__name__)


async def create_artifact_run(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
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
        run = await load_valid_studio_card_run(
            card_id=card_id,
            run_id=requested_run_id,
            project_id=body.project_id,
            expected_session_id=getattr(artifact, "sessionId", None) or session_id,
        )
    else:
        run = await create_session_run(
            db=db_service.db,
            session_id=getattr(artifact, "sessionId", None) or session_id,
            project_id=body.project_id,
            tool_type=f"studio_card:{card_id}",
            step=RUN_STEP_OUTLINE,
            status=RUN_STATUS_PENDING,
        )
    run_for_response = run
    if run:
        generating_run = await update_session_run(
            db=db_service.db,
            run_id=run.id,
            status=RUN_STATUS_PROCESSING,
            step=RUN_STEP_GENERATE,
        )
        if generating_run:
            run_for_response = generating_run
        finalized_run = await update_session_run(
            db=db_service.db,
            run_id=run.id,
            status=RUN_STATUS_COMPLETED,
            step=RUN_STEP_COMPLETED,
            artifact_id=artifact.id,
        )
        if finalized_run:
            run_for_response = finalized_run
        current_metadata = (
            getattr(artifact, "metadata", None)
            if isinstance(getattr(artifact, "metadata", None), dict)
            else {}
        )
        run_id = getattr(run_for_response, "id", None) or getattr(run, "id", None)
        run_no = getattr(run_for_response, "runNo", None) or getattr(run, "runNo", None)
        run_title = getattr(run_for_response, "title", None) or getattr(
            run, "title", None
        )
        tool_type = getattr(run_for_response, "toolType", None) or getattr(
            run, "toolType", None
        )
        from services.project_space_service.service import project_space_service

        await project_space_service.update_artifact_metadata(
            artifact.id,
            {
                **current_metadata,
                "run_id": run_id,
                "run_no": run_no,
                "run_title": run_title,
                "tool_type": tool_type,
            },
            project_id=body.project_id,
            user_id=getattr(artifact, "ownerUserId", None) or user_id,
        )
        spawn_background_task(
            generate_semantic_run_title(
                db=db_service.db,
                run_id=run.id,
                tool_type=run.toolType,
                snapshot=body.config,
            ),
            label=f"studio-card-run:{run.id}",
        )
    await append_card_execution_completed_event(
        card_id=card_id,
        session_id=getattr(artifact, "sessionId", None) or session_id,
        artifact=artifact,
        run=run_for_response,
    )
    return serialize_session_run(run_for_response)


async def load_valid_studio_card_run(
    *,
    card_id: str,
    run_id: str,
    project_id: str,
    expected_session_id: str | None,
):
    run_model = getattr(db_service.db, "sessionrun", None)
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


async def promote_requested_run_to_generating(
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

    run = await load_valid_studio_card_run(
        card_id=card_id,
        run_id=requested_run_id,
        project_id=body.project_id,
        expected_session_id=session_id,
    )
    await update_session_run(
        db=db_service.db,
        run_id=run.id,
        status=RUN_STATUS_PROCESSING,
        step=RUN_STEP_GENERATE,
    )


async def resolve_execution_session_id(
    *,
    project_id: str,
    user_id: str,
    client_session_id: str | None,
) -> str | None:
    normalized = str(client_session_id or "").strip()
    if not normalized:
        return None

    db_handle = getattr(db_service, "db", None)
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


async def append_card_execution_completed_event(
    *,
    card_id: str,
    session_id: str | None,
    artifact,
    run,
) -> None:
    if not session_id:
        return

    db_handle = getattr(db_service, "db", None)
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
