from __future__ import annotations

import json
import logging
from types import SimpleNamespace

from schemas.studio_cards import StudioCardExecutionPreviewRequest
from services.database import db_service
from services.generation_session_service.card_execution_runtime_failure_events import (
    append_card_execution_failed_event,
)
from services.generation_session_service.event_store import append_event
from services.generation_session_service.session_history import build_run_trace_payload
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.task_executor.constants import TaskFailureStateReason
from utils.exceptions import APIException, ErrorCode

logger = logging.getLogger(__name__)


def _serialize_artifact_metadata(metadata: object) -> str | None:
    if metadata is None:
        return None
    if isinstance(metadata, str):
        return metadata
    try:
        return json.dumps(metadata, ensure_ascii=False)
    except (TypeError, ValueError):
        return None


def _coerce_artifact_metadata_dict(metadata: object) -> dict:
    if isinstance(metadata, dict):
        return dict(metadata)
    if isinstance(metadata, str) and metadata.strip():
        try:
            parsed = json.loads(metadata)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return dict(parsed)
    return {}


def _build_metadata_from_snapshot(snapshot: object) -> dict:
    if not isinstance(snapshot, dict) or not snapshot:
        return {}
    normalized = dict(snapshot)
    metadata: dict = {
        "content_snapshot": normalized,
    }
    kind = str(normalized.get("kind") or "").strip()
    if kind:
        metadata["kind"] = kind
    title = str(normalized.get("title") or "").strip()
    if title:
        metadata["title"] = title
    for key in (
        "format",
        "render_mode",
        "duration_seconds",
        "rhythm",
        "focus",
        "visual_type",
        "topic",
        "summary",
        "runtime_version",
        "runtime_graph_version",
        "runtime_graph",
        "runtime_draft_version",
        "runtime_draft",
        "runtime_attempt_count",
        "runtime_provider",
        "runtime_model",
        "runtime_validation_report",
        "component_code",
        "compile_status",
        "compile_errors",
        "family_hint",
        "scene_outline",
        "used_primitives",
        "generation_prompt_digest",
        "runtime_source",
        "runtime_contract",
    ):
        if key in normalized:
            metadata[key] = normalized[key]
    return metadata


async def ensure_local_artifact_record(*, artifact, fallback_session_id: str | None) -> None:
    artifact_model = getattr(db_service.db, "artifact", None)
    if artifact_model is None:
        return
    if not hasattr(artifact_model, "find_unique") or not hasattr(
        artifact_model, "create"
    ):
        return

    artifact_id = str(getattr(artifact, "id", "") or "").strip()
    project_id = str(getattr(artifact, "projectId", "") or "").strip()
    artifact_type = str(getattr(artifact, "type", "") or "").strip()
    visibility = str(getattr(artifact, "visibility", "") or "").strip()
    if not artifact_id or not project_id or not artifact_type or not visibility:
        return

    session_id = str(
        getattr(artifact, "sessionId", None) or fallback_session_id or ""
    ).strip() or None
    owner_user_id = str(getattr(artifact, "ownerUserId", None) or "").strip() or None
    storage_path = str(getattr(artifact, "storagePath", None) or "").strip() or None
    metadata = _serialize_artifact_metadata(getattr(artifact, "metadata", None))

    existing = await artifact_model.find_unique(where={"id": artifact_id})
    if existing:
        if not hasattr(artifact_model, "update"):
            return
        update_data = {
            "projectId": project_id,
            "type": artifact_type,
            "visibility": visibility,
            "metadata": metadata,
            "storagePath": storage_path,
            "ownerUserId": owner_user_id,
            "sessionId": session_id,
        }
        await artifact_model.update(
            where={"id": artifact_id},
            data={key: value for key, value in update_data.items() if value is not None},
        )
        return

    create_data = {
        "id": artifact_id,
        "projectId": project_id,
        "type": artifact_type,
        "visibility": visibility,
        "metadata": metadata,
        "storagePath": storage_path,
        "ownerUserId": owner_user_id,
        "sessionId": session_id,
    }
    await artifact_model.create(
        data={key: value for key, value in create_data.items() if value is not None}
    )


async def create_artifact_run(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    user_id: str,
    artifact,
    session_id: str | None = None,
    title_snapshot: dict | None = None,
):
    from services.generation_session_service.session_history import (
        RUN_STATUS_COMPLETED,
        RUN_STATUS_PENDING,
        RUN_STATUS_PROCESSING,
        RUN_STEP_COMPLETED,
        RUN_STEP_GENERATE,
        RUN_STEP_OUTLINE,
        create_session_run,
        request_run_title_generation,
        serialize_session_run,
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
        await ensure_local_artifact_record(
            artifact=artifact,
            fallback_session_id=getattr(artifact, "sessionId", None) or session_id,
        )
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
        current_metadata = _coerce_artifact_metadata_dict(
            getattr(artifact, "metadata", None)
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

        if not current_metadata:
            try:
                persisted_artifact = await project_space_service.get_artifact(
                    artifact.id,
                    user_id=getattr(artifact, "ownerUserId", None) or user_id,
                )
            except Exception:
                persisted_artifact = None
            if persisted_artifact is not None:
                current_metadata = _coerce_artifact_metadata_dict(
                    getattr(persisted_artifact, "metadata", None)
                )
        if not current_metadata:
            current_metadata = _build_metadata_from_snapshot(title_snapshot)

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
        await ensure_local_artifact_record(
            artifact=SimpleNamespace(
                id=getattr(artifact, "id", None),
                projectId=getattr(artifact, "projectId", None),
                sessionId=getattr(artifact, "sessionId", None) or session_id,
                ownerUserId=getattr(artifact, "ownerUserId", None) or user_id,
                type=getattr(artifact, "type", None),
                visibility=getattr(artifact, "visibility", None),
                storagePath=getattr(artifact, "storagePath", None),
                metadata={
                    **current_metadata,
                    "run_id": run_id,
                    "run_no": run_no,
                    "run_title": run_title,
                    "tool_type": tool_type,
                },
            ),
            fallback_session_id=getattr(artifact, "sessionId", None) or session_id,
        )
        effective_title_snapshot: dict | None = None
        if isinstance(body.config, dict):
            effective_title_snapshot = dict(body.config)
        if isinstance(title_snapshot, dict):
            effective_title_snapshot = {
                **(effective_title_snapshot or {}),
                **title_snapshot,
            }

        await request_run_title_generation(
            db=db_service.db,
            run_id=run.id,
            tool_type=run.toolType,
            snapshot=effective_title_snapshot if effective_title_snapshot is not None else body.config,
        )
        run_model = getattr(db_service.db, "sessionrun", None)
        if run_model is not None and hasattr(run_model, "find_unique"):
            refreshed_run = await run_model.find_unique(where={"id": run.id})
            if refreshed_run is not None:
                run_for_response = refreshed_run
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


async def mark_requested_run_execution_failed(
    *,
    card_id: str,
    body: StudioCardExecutionPreviewRequest,
    session_id: str | None,
    error: Exception,
) -> None:
    from services.generation_session_service.session_history import (
        RUN_STATUS_FAILED,
        RUN_STEP_GENERATE,
        update_session_run,
    )

    requested_run_id = str(getattr(body, "run_id", None) or "").strip()
    run_id: str | None = requested_run_id or None
    if requested_run_id:
        try:
            run = await load_valid_studio_card_run(
                card_id=card_id,
                run_id=requested_run_id,
                project_id=body.project_id,
                expected_session_id=session_id,
            )
        except APIException:
            run = None
        if run is not None:
            run_id = getattr(run, "id", None) or requested_run_id
            await update_session_run(
                db=db_service.db,
                run_id=run.id,
                status=RUN_STATUS_FAILED,
                step=RUN_STEP_GENERATE,
            )
    await append_card_execution_failed_event(
        card_id=card_id,
        session_id=session_id,
        run_id=run_id,
        error=error,
    )


async def resolve_execution_session_id(
    *,
    project_id: str,
    user_id: str,
    client_session_id: str | None,
    require_client_session_id: bool = False,
) -> str | None:
    normalized = str(client_session_id or "").strip()
    if not normalized:
        if require_client_session_id:
            raise APIException(
                status_code=409,
                error_code=ErrorCode.RESOURCE_CONFLICT,
                message="请先在会话管理器中创建或选择会话，再执行 Studio 卡片。",
                details={"reason": "missing_client_session_id"},
            )
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

    normalized_options: dict | None = None
    raw_options = getattr(session, "options", None)
    if isinstance(raw_options, dict):
        normalized_options = dict(raw_options)
    elif isinstance(raw_options, str):
        try:
            parsed = json.loads(raw_options)
            if isinstance(parsed, dict):
                normalized_options = parsed
        except json.JSONDecodeError:
            normalized_options = None

    update_payload: dict[str, object] = {
        "state": GenerationState.SUCCESS.value,
        "stateReason": TaskFailureStateReason.COMPLETED.value,
        "progress": 100,
        "errorCode": None,
        "errorMessage": None,
        "errorRetryable": False,
        "resumable": True,
    }
    if card_id != "courseware_ppt" and isinstance(normalized_options, dict):
        if "diego" in normalized_options:
            normalized_options = dict(normalized_options)
            normalized_options.pop("diego", None)
            if isinstance(raw_options, str):
                update_payload["options"] = json.dumps(
                    normalized_options,
                    ensure_ascii=False,
                )
            else:
                update_payload["options"] = normalized_options

    if hasattr(session_model, "update"):
        try:
            session = await session_model.update(
                where={"id": session_id},
                data=update_payload,
            )
        except Exception as exc:
            logger.warning(
                "Skip studio-card completion state sync due to update error: %s",
                exc,
            )

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
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            progress=100,
            payload=payload,
        )
        await append_event(
            db=db_handle,
            schema_version=1,
            session_id=session_id,
            event_type=GenerationEventType.STATE_CHANGED.value,
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            progress=100,
            payload=payload,
        )
    except Exception as exc:
        logger.warning("Skip studio-card completion event persistence failure: %s", exc)
