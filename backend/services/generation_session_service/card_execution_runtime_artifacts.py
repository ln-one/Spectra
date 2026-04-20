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
from utils.exceptions import APIException, ErrorCode

from .card_source_bindings import get_card_source_artifact_types
from .card_execution_runtime_helpers import (
    artifact_result_payload,
    build_source_snapshot_payload,
    build_latest_runnable_state,
    build_provenance_payload,
    build_source_binding_payload,
    create_replacement_artifact,
    load_artifact_content,
    resolve_effective_source_artifact_id,
    validate_simulator_turn_artifact,
    validate_source_artifact,
    validate_structured_refine_artifact,
)
from .card_execution_runtime_run_helpers import (
    create_artifact_run,
    mark_requested_run_execution_failed,
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


def _has_valid_source_binding(card_id: str, source_artifact_id: str | None) -> bool:
    return bool(
        source_artifact_id
        or card_id == "word_document"
        or not get_card_source_artifact_types(card_id)
    )


def _normalize_animation_output_format(
    artifact_type: str | None,
    content: dict[str, object] | None,
) -> str:
    normalized_type = str(artifact_type or "").strip().lower()
    if normalized_type == "html":
        return "html5"
    if normalized_type in {"gif", "html5"}:
        return normalized_type
    if not isinstance(content, dict):
        return ""
    for key in ("animation_format", "format", "render_mode"):
        value = str(content.get(key) or "").strip().lower()
        if value in {"gif", "html5"}:
            return value
        if value == "html":
            return "html5"
    return ""


def _resolve_animation_placement_supported(
    *,
    card_id: str,
    artifact_type: str | None,
    content: dict[str, object] | None,
) -> bool | None:
    if card_id != "demonstration_animations":
        return None
    return _normalize_animation_output_format(artifact_type, content) == "gif"


async def execute_studio_card_artifact_request(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    preview,
) -> StudioCardExecutionResult:
    payload = dict(preview.initial_request.payload)
    client_session_id = str(body.client_session_id or "").strip() or None
    execution_session_id = await resolve_execution_session_id(
        project_id=body.project_id,
        user_id=user_id,
        client_session_id=client_session_id,
        require_client_session_id=True,
    )
    requested_run_id = str(getattr(body, "run_id", None) or "").strip() or None
    logger.info(
        "studio_card_execute_session_resolved card_id=%s client_session_id=%s "
        "resolved_session_id=%s run_id=%s mismatch_reason=%s",
        card_id,
        client_session_id,
        execution_session_id,
        requested_run_id,
        None,
    )
    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    effective_source_artifact_id = await resolve_effective_source_artifact_id(
        project_id=body.project_id,
        primary_source_id=body.primary_source_id,
        source_artifact_id=body.source_artifact_id,
    )
    await validate_source_artifact(
        project_id=body.project_id,
        card_id=card_id,
        user_id=user_id,
        source_artifact_id=effective_source_artifact_id,
    )
    await promote_requested_run_to_generating(
        card_id=card_id,
        body=body,
        session_id=execution_session_id,
    )
    try:
        artifact_content = dict(payload.get("content") or {})
        placement_supported = _resolve_animation_placement_supported(
            card_id=card_id,
            artifact_type=payload.get("type"),
            content=artifact_content,
        )
        generated_content = await build_studio_tool_artifact_content(
            card_id=card_id,
            project_id=body.project_id,
            user_id=user_id,
            config=body.config,
            source_artifact_id=effective_source_artifact_id,
            rag_source_ids=body.rag_source_ids,
        )
        if generated_content:
            artifact_content.update(generated_content)
        placement_supported = _resolve_animation_placement_supported(
            card_id=card_id,
            artifact_type=payload.get("type"),
            content=artifact_content,
        )
        source_artifact_id = str(
            effective_source_artifact_id
            or artifact_content.get("source_artifact_id")
            or payload.get("source_artifact_id")
            or ""
        ).strip()
        artifact_content["primary_source_id"] = body.primary_source_id
        artifact_content["selected_source_ids"] = body.selected_source_ids or []
        artifact_content["source_snapshot"] = await build_source_snapshot_payload(
            project_id=body.project_id,
            primary_source_id=body.primary_source_id,
            selected_source_ids=body.selected_source_ids,
            source_artifact_id=source_artifact_id or None,
        )
        if card_id == "word_document":
            artifact_content["title"] = await resolve_word_document_title(
                source_artifact_id=source_artifact_id,
                user_id=user_id,
                config=(body.config if isinstance(body.config, dict) else {}),
                existing_title=str(artifact_content.get("title") or "").strip(),
            )
        artifact_content["provenance"] = build_provenance_payload(
            card_id=card_id,
            session_id=execution_session_id,
            source_artifact_id=source_artifact_id or None,
            request_snapshot={
                "config": body.config,
                "preview": payload,
                "primary_source_id": body.primary_source_id,
                "selected_source_ids": body.selected_source_ids,
            },
        )
        artifact_content["source_binding"] = build_source_binding_payload(
            card_id=card_id,
            source_artifact_id=source_artifact_id or None,
            accepted_types=get_card_source_artifact_types(card_id),
        )
        if card_id == "demonstration_animations":
            artifact_content["placement_supported"] = bool(placement_supported)
            artifact_content["runtime_preview_mode"] = "local_preview_only"
        artifact_content["latest_runnable_state"] = build_latest_runnable_state(
            card_id=card_id,
            artifact_id=None,
            session_id=execution_session_id,
            source_binding_valid=_has_valid_source_binding(card_id, source_artifact_id),
            placement_supported=placement_supported,
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
                user_id=user_id,
                source_artifact_id=source_artifact_id,
            )
        run = await create_artifact_run(
            card_id=card_id,
            body=body,
            user_id=user_id,
            artifact=artifact,
            session_id=execution_session_id,
            title_snapshot=artifact_content if isinstance(artifact_content, dict) else None,
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
                source_binding_valid=_has_valid_source_binding(card_id, source_artifact_id),
                placement_supported=placement_supported,
            ),
            provenance=build_provenance_payload(
                card_id=card_id,
                artifact_id=artifact.id,
                session_id=execution_session_id,
                source_artifact_id=source_artifact_id or None,
                request_snapshot={
                    "config": body.config,
                    "preview": payload,
                    "primary_source_id": body.primary_source_id,
                    "selected_source_ids": body.selected_source_ids,
                },
            ),
            source_binding=build_source_binding_payload(
                card_id=card_id,
                source_artifact_id=source_artifact_id or None,
                accepted_types=get_card_source_artifact_types(card_id),
            ),
            selection_anchor_schema_version="studio.selection_anchor.v1",
        )
    except Exception as exc:
        await mark_requested_run_execution_failed(
            card_id=card_id,
            body=body,
            session_id=execution_session_id,
            error=exc,
        )
        raise


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
        user_id=user_id,
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
        user_id=user_id,
        artifact=new_artifact,
        session_id=getattr(new_artifact, "sessionId", None) or body.session_id,
        title_snapshot=updated_content if isinstance(updated_content, dict) else None,
    )
    placement_supported = _resolve_animation_placement_supported(
        card_id=card_id,
        artifact_type=str(getattr(new_artifact, "type", "") or "").strip(),
        content=updated_content if isinstance(updated_content, dict) else None,
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
            placement_supported=placement_supported,
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
                "primary_source_id": body.primary_source_id,
                "selected_source_ids": body.selected_source_ids,
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
        user_id=user_id,
        artifact_id=body.artifact_id,
    )
    expected_session_id = str(body.session_id or "").strip()
    artifact_session_id = str(getattr(artifact, "sessionId", None) or "").strip()
    if expected_session_id and artifact_session_id and artifact_session_id != expected_session_id:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="artifact_id 不属于当前会话，请刷新后重试。",
            details={
                "reason": "session_mismatch",
                "expected_session_id": expected_session_id,
                "artifact_session_id": artifact_session_id,
            },
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
