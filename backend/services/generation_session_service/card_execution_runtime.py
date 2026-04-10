from __future__ import annotations

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
from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STEP_OUTLINE,
    create_session_run,
    generate_semantic_run_title,
    serialize_session_run,
    spawn_background_task,
)
from utils.exceptions import APIException, ErrorCode

from . import card_execution_runtime_helpers as _runtime_helpers
from .card_execution_preview import build_studio_card_execution_preview
from .card_execution_runtime_artifacts import (
    execute_classroom_simulator_turn_artifact,
    execute_studio_card_artifact_request,
    execute_studio_card_structured_refine,
)
from .card_execution_runtime_sessions import (
    execute_studio_card_session_request,
    resolve_bound_session,
)

_load_artifact_content = _runtime_helpers.load_artifact_content
supports_structured_refine = _runtime_helpers.supports_structured_refine
validate_source_artifact = _runtime_helpers.validate_source_artifact


def _build_foundation_ready_preview(
    *,
    card_id: str,
    project_id: str,
    config,
    template_config=None,
    visibility=None,
    source_artifact_id=None,
    rag_source_ids=None,
    not_found_message: str = "Studio 卡片不存在",
    not_ready_message: str = "该 Studio 卡片的执行协议尚未正式就绪",
):
    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=project_id,
        config=config,
        template_config=template_config,
        visibility=visibility,
        source_artifact_id=source_artifact_id,
        rag_source_ids=rag_source_ids,
    )
    if preview is None:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message=not_found_message,
        )
    if preview.readiness != StudioCardReadiness.FOUNDATION_READY:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message=not_ready_message,
        )
    return preview


async def execute_studio_card_draft_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    session_service,
) -> StudioCardExecutionResult:
    preview = _build_foundation_ready_preview(
        card_id=card_id,
        project_id=body.project_id,
        config=body.config,
        template_config=body.template_config,
        visibility=body.visibility,
        source_artifact_id=body.source_artifact_id,
        rag_source_ids=body.rag_source_ids,
        not_ready_message="请等待 Studio 卡片执行协议就绪后再试",
    )
    if not body.client_session_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="请先在会话管理器中创建或选择会话，再执行 Studio 卡片。",
        )

    draft_source_artifact_id = body.source_artifact_id or (
        preview.initial_request.payload.get("options") or {}
    ).get("source_artifact_id")
    await validate_source_artifact(
        project_id=body.project_id,
        card_id=card_id,
        source_artifact_id=draft_source_artifact_id,
    )
    existing_session = await resolve_bound_session(
        session_service=session_service,
        project_id=body.project_id,
        user_id=user_id,
        client_session_id=body.client_session_id,
        card_id=card_id,
    )

    run = await create_session_run(
        db=session_service._db,
        session_id=existing_session.id,
        project_id=body.project_id,
        tool_type=f"studio_card:{card_id}",
        step=RUN_STEP_OUTLINE,
        status=RUN_STATUS_PENDING,
    )
    if run:
        spawn_background_task(
            generate_semantic_run_title(
                db=session_service._db,
                run_id=run.id,
                tool_type=run.toolType,
                snapshot=body.config,
            ),
            label=f"studio-card-draft-run:{run.id}",
        )
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.SESSION_CREATE,
        resource_kind=StudioCardExecutionResultKind.SESSION,
        session={"session_id": existing_session.id},
        run=serialize_session_run(run),
        request_preview=preview.initial_request,
    )


async def execute_studio_card_initial_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    session_service,
    task_queue_service=None,
) -> StudioCardExecutionResult:
    preview = _build_foundation_ready_preview(
        card_id=card_id,
        project_id=body.project_id,
        config=body.config,
        template_config=body.template_config,
        visibility=body.visibility,
        source_artifact_id=body.source_artifact_id,
        rag_source_ids=body.rag_source_ids,
    )

    request_preview = preview.initial_request
    payload = dict(request_preview.payload)

    if request_preview.endpoint == "/api/v1/generate/sessions":
        return await execute_studio_card_session_request(
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
