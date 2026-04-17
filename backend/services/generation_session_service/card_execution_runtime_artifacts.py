from __future__ import annotations

import logging

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
from services.project_space_service.service import project_space_service

from .card_source_bindings import get_card_source_artifact_types
from .card_execution_runtime_helpers import (
    artifact_result_payload,
    build_latest_runnable_state,
    build_provenance_payload,
    build_source_binding_payload,
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
from .card_execution_runtime_simulator import normalize_simulator_turn_result
from .card_execution_runtime_word import (
    resolve_word_document_title,
    sync_word_source_metadata,
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
        artifact_content["title"] = await resolve_word_document_title(
            source_artifact_id=source_artifact_id,
            config=(body.config if isinstance(body.config, dict) else {}),
            existing_title=str(artifact_content.get("title") or "").strip(),
        )
    artifact_content["provenance"] = build_provenance_payload(
        card_id=card_id,
        session_id=execution_session_id,
        source_artifact_id=source_artifact_id or None,
        request_snapshot={"config": body.config, "preview": payload},
    )
    artifact_content["source_binding"] = build_source_binding_payload(
        card_id=card_id,
        source_artifact_id=source_artifact_id or None,
        accepted_types=get_card_source_artifact_types(card_id),
    )
    artifact_content["latest_runnable_state"] = build_latest_runnable_state(
        card_id=card_id,
        artifact_id=None,
        session_id=execution_session_id,
        source_binding_valid=bool(
            source_artifact_id or not get_card_source_artifact_types(card_id)
        ),
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
        await sync_word_source_metadata(
            artifact=artifact,
            source_artifact_id=source_artifact_id,
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
        execution_carrier=getattr(preview, "execution_carrier", None),
        latest_runnable_state=build_latest_runnable_state(
            card_id=card_id,
            artifact_id=artifact.id,
            session_id=execution_session_id,
            source_binding_valid=bool(source_artifact_id or not get_card_source_artifact_types(card_id)),
        ),
        provenance=build_provenance_payload(
            card_id=card_id,
            artifact_id=artifact.id,
            session_id=execution_session_id,
            source_artifact_id=source_artifact_id or None,
            request_snapshot={"config": body.config, "preview": payload},
        ),
        source_binding=build_source_binding_payload(
            card_id=card_id,
            source_artifact_id=source_artifact_id or None,
            accepted_types=get_card_source_artifact_types(card_id),
        ),
        selection_anchor_schema_version="studio.selection_anchor.v1",
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
    artifact_payload = artifact_result_payload(new_artifact)
    inserted_node_id = updated_content.get("_inserted_node_id")
    if isinstance(inserted_node_id, str) and inserted_node_id.strip():
        artifact_payload["inserted_node_id"] = inserted_node_id.strip()
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
        artifact=artifact_payload,
        run=run,
        request_preview=preview.refine_request,
        execution_carrier=getattr(preview, "execution_carrier", None),
        latest_runnable_state=build_latest_runnable_state(
            card_id=card_id,
            artifact_id=new_artifact.id,
            session_id=getattr(new_artifact, "sessionId", None) or body.session_id,
            source_binding_valid=True,
            refine_mode=body.refine_mode,
        ),
        provenance=build_provenance_payload(
            card_id=card_id,
            artifact_id=new_artifact.id,
            session_id=getattr(new_artifact, "sessionId", None) or body.session_id,
            source_artifact_id=body.source_artifact_id,
            request_snapshot={
                "message": body.message,
                "config": body.config,
                "selection_anchor": body.selection_anchor,
                "refine_mode": body.refine_mode.value,
            },
            replaces_artifact_id=body.artifact_id,
        ),
        source_binding=build_source_binding_payload(
            card_id=card_id,
            source_artifact_id=body.source_artifact_id,
            accepted_types=get_card_source_artifact_types(card_id),
        ),
        selection_anchor_schema_version="studio.selection_anchor.v1",
    )


async def execute_classroom_simulator_turn_artifact(
    *,
    body: StudioCardTurnRequest,
    user_id: str,
    load_content=load_artifact_content,
) -> tuple[dict, StudioCardTurnResult, dict]:
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
    latest_runnable_state = build_latest_runnable_state(
        card_id="classroom_qa_simulator",
        artifact_id=new_artifact.id,
        session_id=getattr(new_artifact, "sessionId", None),
        source_binding_valid=True,
        refine_mode=None,
    )
    return (
        artifact_result_payload(new_artifact),
        normalize_simulator_turn_result(
            turn_result=turn_result,
            teacher_answer=body.teacher_answer,
            config=body.config,
        ),
        latest_runnable_state,
    )
