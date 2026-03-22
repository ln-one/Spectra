from __future__ import annotations

import json
from typing import Optional

from schemas.generation import TaskStatus
from services.generation_session_service.session_history import serialize_session_run
from services.platform.state_transition_guard import GenerationState


def _state_to_legacy_status(state: str) -> str:
    mapping = {
        GenerationState.IDLE.value: TaskStatus.PENDING.value,
        GenerationState.CONFIGURING.value: TaskStatus.PENDING.value,
        GenerationState.ANALYZING.value: TaskStatus.PROCESSING.value,
        GenerationState.DRAFTING_OUTLINE.value: TaskStatus.PROCESSING.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value: TaskStatus.PROCESSING.value,
        GenerationState.GENERATING_CONTENT.value: TaskStatus.PROCESSING.value,
        GenerationState.RENDERING.value: TaskStatus.PROCESSING.value,
        GenerationState.SUCCESS.value: TaskStatus.COMPLETED.value,
        GenerationState.FAILED.value: TaskStatus.FAILED.value,
    }
    return mapping.get(state, TaskStatus.PENDING.value)


def _to_session_ref(
    session,
    contract_version: str,
    schema_version: int,
    task_id: Optional[str] = None,
) -> dict:
    return {
        "session_id": session.id,
        "project_id": session.projectId,
        "base_version_id": getattr(session, "baseVersionId", None),
        "task_id": task_id,
        "state": session.state,
        "state_reason": session.stateReason,
        "status": _state_to_legacy_status(session.state),
        "contract_version": contract_version,
        "schema_version": schema_version,
        "progress": session.progress,
        "resumable": session.resumable,
        "updated_at": session.updatedAt.isoformat() if session.updatedAt else None,
        "render_version": session.renderVersion,
        "display_title": getattr(session, "displayTitle", None),
        "display_title_source": getattr(session, "displayTitleSource", None),
        "display_title_updated_at": (
            session.displayTitleUpdatedAt.isoformat()
            if getattr(session, "displayTitleUpdatedAt", None)
            else None
        ),
    }


def _to_generation_event(event) -> dict:
    payload = None
    if event.payload:
        try:
            payload = json.loads(event.payload)
        except json.JSONDecodeError:
            payload = None
    return {
        "event_id": event.id,
        "event_schema_version": event.schemaVersion,
        "event_type": event.eventType,
        "state": event.state,
        "state_reason": event.stateReason,
        "progress": event.progress,
        "timestamp": event.createdAt.isoformat(),
        "cursor": event.cursor,
        "payload": payload,
    }


def _to_session_run(run) -> dict | None:
    return serialize_session_run(run)
