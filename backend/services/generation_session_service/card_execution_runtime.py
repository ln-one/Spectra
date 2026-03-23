from __future__ import annotations

import logging

from schemas.studio_cards import (
    StudioCardExecutionPreviewRequest,
    StudioCardExecutionResult,
    StudioCardExecutionResultKind,
    StudioCardReadiness,
    StudioCardRefineRequest,
    StudioCardTransport,
    StudioCardTurnRequest,
    StudioCardTurnResult,
)
from services.application.access import get_owned_project
from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STATUS_PROCESSING,
    RUN_STEP_GENERATE,
    RUN_STEP_OUTLINE,
    create_session_run,
    generate_semantic_run_title,
    serialize_session_run,
    spawn_background_task,
)
from services.platform.state_transition_guard import GenerationState
from utils.exceptions import APIException, ErrorCode

from . import card_execution_runtime_helpers as _runtime_helpers
from .card_execution_preview import build_studio_card_execution_preview
from .card_execution_runtime_artifacts import (
    execute_classroom_simulator_turn_artifact,
    execute_studio_card_artifact_request,
    execute_studio_card_structured_refine,
)

_artifact_metadata_dict = _runtime_helpers.artifact_metadata_dict
_artifact_result_payload = _runtime_helpers.artifact_result_payload
_load_artifact_content = _runtime_helpers.load_artifact_content
_validate_source_artifact = _runtime_helpers.validate_source_artifact
supports_structured_refine = _runtime_helpers.supports_structured_refine
validate_source_artifact = _runtime_helpers.validate_source_artifact
logger = logging.getLogger(__name__)


async def execute_studio_card_initial_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    session_service,
    task_queue_service=None,
) -> StudioCardExecutionResult:
    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=body.project_id,
        config=body.config,
        visibility=body.visibility,
        source_artifact_id=body.source_artifact_id,
        rag_source_ids=body.rag_source_ids,
    )
    if preview is None:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="Studio 卡片不存在",
        )

    if preview.readiness != StudioCardReadiness.FOUNDATION_READY:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="该 Studio 卡片的执行协议尚未正式就绪",
        )

    request_preview = preview.initial_request
    payload = dict(request_preview.payload)

    if request_preview.endpoint == "/api/v1/generate/sessions":
        return await _execute_session_request(
            card_id=card_id,
            body=body,
            user_id=user_id,
            payload=payload,
            request_preview=request_preview,
            preview=preview,
            session_service=session_service,
            task_queue_service=task_queue_service,
        )

    if request_preview.endpoint == (f"/api/v1/projects/{body.project_id}/artifacts"):
        return await execute_studio_card_artifact_request(
            card_id=card_id,
            body=body,
            user_id=user_id,
            preview=preview,
        )

    raise APIException(
        status_code=409,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message="该 Studio 卡片的执行协议尚未映射到可执行后端路径",
    )


async def execute_studio_card_refine_request(
    *,
    card_id: str,
    body: StudioCardRefineRequest,
    user_id: str,
) -> StudioCardExecutionResult:
    if not supports_structured_refine(card_id):
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="该 Studio 卡片当前不支持结构化 refine",
        )
    if not body.artifact_id:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="artifact_id 为结构化 refine 的必填字段",
        )

    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=body.project_id,
        config=body.config,
        visibility=body.visibility,
        source_artifact_id=body.source_artifact_id,
        rag_source_ids=body.rag_source_ids,
    )
    if preview is None or preview.refine_request is None:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="Studio 卡片不存在",
        )

    return await execute_studio_card_structured_refine(
        card_id=card_id,
        body=body,
        user_id=user_id,
        preview=preview,
        load_content=_load_artifact_content,
    )


async def execute_classroom_simulator_turn(
    *,
    body: StudioCardTurnRequest,
    user_id: str,
) -> tuple[dict, StudioCardTurnResult]:
    return await execute_classroom_simulator_turn_artifact(
        body=body,
        user_id=user_id,
        load_content=_load_artifact_content,
    )


async def _execute_session_request(
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
    if body.client_session_id:
        try:
            existing_session = await session_service._db.generationsession.find_first(
                where={
                    "projectId": body.project_id,
                    "userId": user_id,
                    "OR": [
                        {"id": body.client_session_id},
                        {"clientSessionId": body.client_session_id},
                    ],
                }
            )
        except Exception as exc:
            logger.warning(
                (
                    "Skip studio-card active-run precheck before session lookup is"
                    " ready: project=%s card=%s client_session=%s error=%s"
                ),
                body.project_id,
                card_id,
                body.client_session_id,
                exc,
            )
            existing_session = None
        if existing_session:
            try:
                active_generate_run = await session_service._db.sessionrun.find_first(
                    where={
                        "sessionId": existing_session.id,
                        "toolType": f"studio_card:{card_id}",
                        "status": {"in": [RUN_STATUS_PENDING, RUN_STATUS_PROCESSING]},
                        "step": RUN_STEP_GENERATE,
                    },
                    order={"updatedAt": "desc"},
                )
            except Exception as exc:
                logger.warning(
                    (
                        "Skip studio-card active-run precheck before run storage is"
                        " ready: session=%s card=%s error=%s"
                    ),
                    existing_session.id,
                    card_id,
                    exc,
                )
                active_generate_run = None
            if active_generate_run:
                raise APIException(
                    status_code=409,
                    error_code=ErrorCode.RESOURCE_CONFLICT,
                    message="当前卡片已有进行中的生成任务，请等待完成后再发起新一轮。",
                )

    session_ref = await session_service.create_session(
        project_id=body.project_id,
        user_id=user_id,
        output_type=payload["output_type"],
        options=payload.get("options"),
        client_session_id=body.client_session_id,
        task_queue_service=task_queue_service,
    )
    if session_ref.get("state") != GenerationState.DRAFTING_OUTLINE.value:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="当前会话暂不可启动新的生成流程，请稍后重试。",
        )
    run = await create_session_run(
        db=session_service._db,
        session_id=session_ref["session_id"],
        project_id=body.project_id,
        tool_type=f"studio_card:{card_id}",
        step=RUN_STEP_OUTLINE,
        status=RUN_STATUS_PROCESSING,
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
