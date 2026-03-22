from __future__ import annotations

import json

from schemas.project_space import ArtifactType, ProjectPermission
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
from .tool_content_builder import (
    build_studio_simulator_turn_update,
    build_studio_tool_artifact_content,
)
from .tool_refine_builder import build_structured_refine_artifact_content

_STRUCTURED_REFINE_ARTIFACT_TYPES = {
    "knowledge_mindmap": ArtifactType.MINDMAP.value,
    "interactive_quick_quiz": ArtifactType.EXERCISE.value,
    "interactive_games": ArtifactType.HTML.value,
    "speaker_notes": ArtifactType.SUMMARY.value,
}

_STRUCTURED_REFINE_KINDS = {
    "knowledge_mindmap": "mindmap",
    "interactive_quick_quiz": "quiz",
    "interactive_games": "interactive_game",
    "speaker_notes": "speaker_notes",
}


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


def _artifact_metadata_dict(artifact) -> dict:
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


async def _validate_source_artifact(
    *,
    project_id: str,
    card_id: str,
    source_artifact_id: str | None,
) -> None:
    if source_artifact_id:
        artifact = await project_space_service.get_artifact(source_artifact_id)
        if not artifact or artifact.projectId != project_id:
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
        return
    if card_id == "speaker_notes":
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="speaker_notes 需要提供 source_artifact_id",
        )


async def _load_artifact_content(artifact) -> dict:
    storage_path = getattr(artifact, "storagePath", None)
    if not storage_path:
        return {}
    with open(storage_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def supports_structured_refine(card_id: str) -> bool:
    return card_id in _STRUCTURED_REFINE_ARTIFACT_TYPES


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
        await get_owned_project(body.project_id, user_id)
        source_artifact_id = (payload.get("options") or {}).get("source_artifact_id")
        await _validate_source_artifact(
            project_id=body.project_id,
            card_id=card_id,
            source_artifact_id=source_artifact_id,
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
        await _validate_source_artifact(
            project_id=body.project_id,
            card_id=card_id,
            source_artifact_id=body.source_artifact_id,
        )
        base_content = dict(payload.get("content") or {})
        generated_content = await build_studio_tool_artifact_content(
            card_id=card_id,
            project_id=body.project_id,
            config=body.config,
            source_artifact_id=body.source_artifact_id,
            rag_source_ids=body.rag_source_ids,
        )
        artifact_content = dict(base_content)
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

    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    artifact = await project_space_service.get_artifact(body.artifact_id)
    if not artifact or artifact.projectId != body.project_id:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="待 refine 的成果不存在",
        )

    expected_type = _STRUCTURED_REFINE_ARTIFACT_TYPES[card_id]
    if artifact.type != expected_type:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前成果类型与卡片 refine 协议不匹配",
        )
    expected_kind = _STRUCTURED_REFINE_KINDS[card_id]
    metadata = _artifact_metadata_dict(artifact)
    artifact_kind = str(metadata.get("kind") or "").strip()
    if artifact_kind and artifact_kind != expected_kind:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前成果 kind 与卡片 refine 协议不匹配",
        )

    current_content = await _load_artifact_content(artifact)
    updated_content = await build_structured_refine_artifact_content(
        card_id=card_id,
        current_content=current_content,
        message=body.message,
        config=body.config,
        project_id=body.project_id,
        rag_source_ids=body.rag_source_ids,
    )
    new_artifact = await project_space_service.create_artifact_with_file(
        project_id=body.project_id,
        artifact_type=artifact.type,
        visibility=artifact.visibility,
        user_id=user_id,
        session_id=getattr(artifact, "sessionId", None),
        based_on_version_id=getattr(artifact, "basedOnVersionId", None),
        content=updated_content,
        artifact_mode="replace",
    )
    project = await project_space_service.db.get_project(body.project_id)
    current_version_id = getattr(project, "currentVersionId", None) if project else None
    return StudioCardExecutionResult(
        card_id=card_id,
        readiness=preview.readiness,
        transport=StudioCardTransport.ARTIFACT_CREATE,
        resource_kind=StudioCardExecutionResultKind.ARTIFACT,
        artifact=_artifact_result_payload(
            new_artifact,
            current_version_id=current_version_id,
        ),
        request_preview=preview.refine_request,
    )


async def execute_classroom_simulator_turn(
    *,
    body: StudioCardTurnRequest,
    user_id: str,
) -> tuple[dict, StudioCardTurnResult]:
    await project_space_service.check_project_permission(
        body.project_id, user_id, ProjectPermission.COLLABORATE
    )
    artifact = await project_space_service.get_artifact(body.artifact_id)
    if not artifact or artifact.projectId != body.project_id:
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
    metadata = _artifact_metadata_dict(artifact)
    if str(metadata.get("kind") or "").strip() != "classroom_qa_simulator":
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前成果不是 classroom_qa_simulator 类型",
        )

    current_content = await _load_artifact_content(artifact)
    updated_content, turn_result = await build_studio_simulator_turn_update(
        current_content=current_content,
        teacher_answer=body.teacher_answer,
        config=body.config,
        project_id=body.project_id,
        rag_source_ids=body.rag_source_ids,
        turn_anchor=body.turn_anchor,
    )
    new_artifact = await project_space_service.create_artifact_with_file(
        project_id=body.project_id,
        artifact_type=artifact.type,
        visibility=artifact.visibility,
        user_id=user_id,
        session_id=getattr(artifact, "sessionId", None),
        based_on_version_id=getattr(artifact, "basedOnVersionId", None),
        content=updated_content,
        artifact_mode="replace",
    )
    project = await project_space_service.db.get_project(body.project_id)
    current_version_id = getattr(project, "currentVersionId", None) if project else None
    return (
        _artifact_result_payload(
            new_artifact,
            current_version_id=current_version_id,
        ),
        StudioCardTurnResult(**turn_result),
    )
