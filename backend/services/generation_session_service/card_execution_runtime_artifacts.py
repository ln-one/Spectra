from __future__ import annotations

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


async def execute_studio_card_artifact_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    preview,
) -> StudioCardExecutionResult:
    payload = dict(preview.initial_request.payload)
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
    artifact = await project_space_service.create_artifact_with_file(
        project_id=body.project_id,
        artifact_type=payload["type"],
        visibility=payload["visibility"],
        user_id=user_id,
        session_id=payload.get("session_id"),
        based_on_version_id=payload.get("based_on_version_id"),
        content=artifact_content,
        artifact_mode="replace",
    )
    run = await _create_artifact_run(
        card_id=card_id,
        body=body,
        artifact=artifact,
    )
    current_version_id = await get_current_version_id(body.project_id)
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.ARTIFACT_CREATE,
        resource_kind=StudioCardExecutionResultKind.ARTIFACT,
        artifact=artifact_result_payload(
            artifact,
            current_version_id=current_version_id,
        ),
        run=run,
        request_preview=preview.initial_request,
    )


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
    current_version_id = await get_current_version_id(body.project_id)
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.ARTIFACT_CREATE,
        resource_kind=StudioCardExecutionResultKind.ARTIFACT,
        artifact=artifact_result_payload(
            new_artifact,
            current_version_id=current_version_id,
        ),
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
    return (
        artifact_result_payload(
            new_artifact,
            current_version_id=current_version_id,
        ),
        StudioCardTurnResult(**turn_result),
    )


async def _create_artifact_run(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    artifact,
):
    from services.generation_session_service.session_history import (
        RUN_STATUS_COMPLETED,
        RUN_STATUS_PROCESSING,
        RUN_STEP_GENERATE,
        RUN_STEP_COMPLETED,
        create_session_run,
        generate_semantic_run_title,
        serialize_session_run,
        spawn_background_task,
        update_session_run,
    )

    run = await create_session_run(
        db=project_space_service.db.db,
        session_id=getattr(artifact, "sessionId", None),
        project_id=body.project_id,
        tool_type=f"studio_card:{card_id}",
        step=RUN_STEP_GENERATE,
        status=RUN_STATUS_PROCESSING,
        artifact_id=artifact.id,
    )
    if run:
        await update_session_run(
            db=project_space_service.db.db,
            run_id=run.id,
            status=RUN_STATUS_COMPLETED,
            step=RUN_STEP_COMPLETED,
            artifact_id=artifact.id,
        )
        if hasattr(project_space_service.db, "update_artifact_metadata"):
            current_metadata = (
                getattr(artifact, "metadata", None)
                if isinstance(getattr(artifact, "metadata", None), dict)
                else {}
            )
            await project_space_service.db.update_artifact_metadata(
                artifact.id,
                {
                    **current_metadata,
                    "run_id": run.id,
                    "run_no": run.runNo,
                    "run_title": run.title,
                    "tool_type": run.toolType,
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
    return serialize_session_run(run)
