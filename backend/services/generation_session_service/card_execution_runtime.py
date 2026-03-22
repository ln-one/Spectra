from __future__ import annotations

from schemas.project_space import ProjectPermission
from schemas.studio_cards import (
    StudioCardExecutionPreviewRequest,
    StudioCardExecutionResult,
    StudioCardExecutionResultKind,
    StudioCardReadiness,
    StudioCardTransport,
)
from services.application.access import get_owned_project
from services.generation_session_service.session_history import (
    RUN_STATUS_COMPLETED,
    RUN_STATUS_PROCESSING,
    RUN_STEP_COMPLETED,
    RUN_STEP_CONFIG,
    create_session_run,
    generate_semantic_run_title,
    serialize_session_run,
    spawn_background_task,
    update_session_run,
)
from services.project_space_service import project_space_service
from utils.exceptions import APIException, ErrorCode

from .card_execution_preview import build_studio_card_execution_preview
from .card_source_bindings import get_card_source_artifact_types


def _artifact_result_payload(
    artifact, *, current_version_id: str | None = None
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
        await get_owned_project(body.project_id, user_id)
        source_artifact_id = (payload.get("options") or {}).get("source_artifact_id")
        if source_artifact_id:
            artifact = await project_space_service.get_artifact(source_artifact_id)
            if not artifact or artifact.projectId != body.project_id:
                raise APIException(
                    status_code=404,
                    error_code=ErrorCode.NOT_FOUND,
                    message="源成果不存在",
                )
            allowed_types = get_card_source_artifact_types(card_id)
            if allowed_types and artifact.type not in allowed_types:
                raise APIException(
                    status_code=400,
                    error_code=ErrorCode.INVALID_INPUT,
                    message="源成果类型与当前卡片不匹配",
                )
        elif card_id == "speaker_notes":
            raise APIException(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="speaker_notes 需要提供 source_artifact_id",
            )
        session_ref = await session_service.create_session(
            project_id=body.project_id,
            user_id=user_id,
            output_type=payload["output_type"],
            options=payload.get("options"),
            client_session_id=body.client_session_id,
            task_queue_service=task_queue_service,
        )
        run = await create_session_run(
            db=session_service._db,
            session_id=session_ref["session_id"],
            project_id=body.project_id,
            tool_type=f"studio_card:{card_id}",
            step=RUN_STEP_CONFIG,
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

    if request_preview.endpoint == f"/api/v1/projects/{body.project_id}/artifacts":
        await project_space_service.check_project_permission(
            body.project_id, user_id, ProjectPermission.COLLABORATE
        )
        artifact = await project_space_service.create_artifact_with_file(
            project_id=body.project_id,
            artifact_type=payload["type"],
            visibility=payload["visibility"],
            user_id=user_id,
            session_id=payload.get("session_id"),
            based_on_version_id=payload.get("based_on_version_id"),
            content=payload.get("content"),
        )
        run = await create_session_run(
            db=project_space_service.db.db,
            session_id=payload.get("session_id"),
            project_id=body.project_id,
            tool_type=f"studio_card:{card_id}",
            step=RUN_STEP_COMPLETED,
            status=RUN_STATUS_COMPLETED,
            artifact_id=artifact.id,
        )
        if run:
            await update_session_run(
                db=project_space_service.db.db,
                run_id=run.id,
                artifact_id=artifact.id,
            )
        if run and hasattr(project_space_service.db, "update_artifact_metadata"):
            await project_space_service.db.update_artifact_metadata(
                artifact.id,
                {
                    **(
                        getattr(artifact, "metadata", None)
                        if isinstance(getattr(artifact, "metadata", None), dict)
                        else {}
                    ),
                    "run_id": run.id,
                    "run_no": run.runNo,
                    "run_title": run.title,
                    "tool_type": run.toolType,
                },
            )
        if run:
            spawn_background_task(
                generate_semantic_run_title(
                    db=project_space_service.db.db,
                    run_id=run.id,
                    tool_type=run.toolType,
                    snapshot=body.config,
                ),
                label=f"studio-card-run:{run.id}",
            )
        project = await project_space_service.db.get_project(body.project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        return StudioCardExecutionResult(
            card_id=card_id,
            readiness=preview.readiness,
            transport=StudioCardTransport.ARTIFACT_CREATE,
            resource_kind=StudioCardExecutionResultKind.ARTIFACT,
            artifact=_artifact_result_payload(
                artifact, current_version_id=current_version_id
            ),
            run=serialize_session_run(run),
            request_preview=request_preview,
        )

    raise APIException(
        status_code=409,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message="该 Studio 卡片的执行协议尚未映射到可执行后端路径",
    )
