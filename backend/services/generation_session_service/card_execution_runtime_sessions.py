from __future__ import annotations

import logging

from schemas.studio_cards import (
    StudioCardExecutionPreviewRequest,
    StudioCardExecutionResult,
    StudioCardExecutionResultKind,
    StudioCardTransport,
)
from services.application.access import get_owned_project
from services.generation_session_service.constants import SessionLifecycleReason
from services.generation_session_service.diego_runtime import (
    should_use_diego_for_courseware,
    start_diego_outline_workflow,
)
from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STEP_OUTLINE,
    create_session_run,
    generate_semantic_run_title,
    serialize_session_run,
    spawn_background_task,
    update_session_run,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from utils.exceptions import APIException, ErrorCode

from .card_execution_runtime_helpers import validate_source_artifact

logger = logging.getLogger(__name__)


async def execute_studio_card_session_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    payload: dict,
    request_preview,
    preview,
    session_service,
    task_queue_service,
) -> StudioCardExecutionResult:
    await get_owned_project(body.project_id, user_id)
    source_artifact_id = (payload.get("options") or {}).get("source_artifact_id")
    await validate_source_artifact(
        project_id=body.project_id,
        card_id=card_id,
        source_artifact_id=source_artifact_id,
    )
    if not body.client_session_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="请先在会话管理器中创建或选择会话，再执行 Studio 卡片。",
        )

    await resolve_bound_session(
        session_service=session_service,
        project_id=body.project_id,
        user_id=user_id,
        client_session_id=body.client_session_id,
        card_id=card_id,
    )

    try:
        session_ref = await session_service.create_session(
            project_id=body.project_id,
            user_id=user_id,
            output_type=payload["output_type"],
            options=payload.get("options"),
            client_session_id=body.client_session_id,
            bootstrap_only=True,
            allow_create=False,
            task_queue_service=task_queue_service,
        )
    except LookupError as exc:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="client_session_id 无效或不属于当前项目，请先在会话管理器中创建会话。",
        ) from exc
    run = await resolve_or_create_studio_run(
        session_service=session_service,
        session_id=session_ref["session_id"],
        project_id=body.project_id,
        card_id=card_id,
        run_id=body.run_id,
    )
    await session_service._db.generationsession.update(
        where={"id": session_ref["session_id"]},
        data={
            "state": GenerationState.DRAFTING_OUTLINE.value,
            "stateReason": SessionLifecycleReason.SESSION_REUSED.value,
            "progress": 0,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
            "resumable": True,
        },
    )
    await session_service._append_event(
        session_id=session_ref["session_id"],
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=GenerationState.DRAFTING_OUTLINE.value,
        state_reason=SessionLifecycleReason.SESSION_REUSED.value,
        progress=0,
        payload={
            "reason": SessionLifecycleReason.SESSION_REUSED.value,
            **(
                {
                    "run_id": run.id,
                    "run_no": run.runNo,
                    "tool_type": run.toolType,
                }
                if run is not None
                else {}
            ),
        },
    )
    if not should_use_diego_for_courseware(card_id=card_id):
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="旧版会话生成链路已下线，仅支持 Diego 课件流程。",
            details={"reason": "legacy_session_generation_removed", "card_id": card_id},
        )

    try:
        await start_diego_outline_workflow(
            db=session_service._db,
            project_id=body.project_id,
            session_id=session_ref["session_id"],
            run=run,
            options=(
                dict(payload.get("options"))
                if isinstance(payload.get("options"), dict)
                else {}
            ),
        )
    except Exception as exc:
        logger.warning(
            "Diego bootstrap failed: session=%s run=%s error=%s",
            session_ref["session_id"],
            getattr(run, "id", None),
            exc,
            exc_info=True,
        )
        if run is not None:
            await update_session_run(
                db=session_service._db,
                run_id=run.id,
                status="failed",
                step=RUN_STEP_OUTLINE,
            )
        await session_service._db.generationsession.update(
            where={"id": session_ref["session_id"]},
            data={
                "state": GenerationState.FAILED.value,
                "stateReason": "diego_bootstrap_failed",
                "errorCode": "DIEGO_CREATE_RUN_FAILED",
                "errorMessage": str(exc),
                "errorRetryable": True,
                "resumable": True,
            },
        )
        await session_service._append_event(
            session_id=session_ref["session_id"],
            event_type=GenerationEventType.STATE_CHANGED.value,
            state=GenerationState.FAILED.value,
            state_reason="diego_bootstrap_failed",
            payload={
                "reason": "diego_bootstrap_failed",
                "error_code": "DIEGO_CREATE_RUN_FAILED",
                "error_message": str(exc),
                "retryable": True,
                "run_id": getattr(run, "id", None),
            },
        )
        raise APIException(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="Diego 任务创建失败，请稍后重试。",
            details={
                "reason": "diego_bootstrap_failed",
                "run_id": getattr(run, "id", None),
                "error": str(exc),
            },
            retryable=True,
        ) from exc
    session_ref.update(
        {
            "state": GenerationState.DRAFTING_OUTLINE.value,
            "state_reason": SessionLifecycleReason.SESSION_REUSED.value,
            "status": "processing",
            "progress": 0,
        }
    )
    if run:
        spawn_background_task(
            generate_semantic_run_title(
                db=session_service._db,
                run_id=run.id,
                tool_type=run.toolType,
                snapshot=body.config,
            ),
            label=f"studio-card-run:{run.id}",
        )
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.SESSION_CREATE,
        resource_kind=StudioCardExecutionResultKind.SESSION,
        session=session_ref,
        run=serialize_session_run(run),
        request_preview=request_preview,
    )


async def resolve_bound_session(
    *,
    session_service,
    project_id: str,
    user_id: str,
    client_session_id: str | None,
    card_id: str,
):
    try:
        existing_session = await session_service._db.generationsession.find_first(
            where={
                "projectId": project_id,
                "userId": user_id,
                "OR": [
                    {"id": client_session_id},
                    {"clientSessionId": client_session_id},
                ],
            }
        )
    except Exception as exc:
        logger.warning(
            (
                "Studio-card session lookup failed before active-run precheck: "
                "project=%s card=%s client_session=%s error=%s"
            ),
            project_id,
            card_id,
            client_session_id,
            exc,
        )
        existing_session = None
    if not existing_session:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="client_session_id 无效或不属于当前项目，请先在会话管理器中创建会话。",
        )
    return existing_session


async def resolve_or_create_studio_run(
    *,
    session_service,
    session_id: str,
    project_id: str,
    card_id: str,
    run_id: str | None,
):
    normalized_run_id = str(run_id or "").strip()
    if normalized_run_id:
        run_model = getattr(session_service._db, "sessionrun", None)
        if run_model is None or not hasattr(run_model, "find_unique"):
            raise APIException(
                status_code=409,
                error_code=ErrorCode.RESOURCE_CONFLICT,
                message="run_id 无效或不属于当前会话，请重新创建草稿。",
            )
        run = await run_model.find_unique(where={"id": normalized_run_id})
        if (
            not run
            or getattr(run, "sessionId", None) != session_id
            or getattr(run, "projectId", None) != project_id
            or getattr(run, "toolType", None) != f"studio_card:{card_id}"
        ):
            raise APIException(
                status_code=409,
                error_code=ErrorCode.RESOURCE_CONFLICT,
                message="run_id 无效或不属于当前会话，请重新创建草稿。",
            )
        updated = await update_session_run(
            db=session_service._db,
            run_id=run.id,
            step=RUN_STEP_OUTLINE,
            status=RUN_STATUS_PENDING,
        )
        return updated or run

    return await create_session_run(
        db=session_service._db,
        session_id=session_id,
        project_id=project_id,
        tool_type=f"studio_card:{card_id}",
        step=RUN_STEP_OUTLINE,
        status=RUN_STATUS_PENDING,
    )
