from __future__ import annotations

import json
from typing import Optional


def _state_to_legacy_status(state: str) -> str:
    mapping = {
        "IDLE": "pending",
        "CONFIGURING": "pending",
        "ANALYZING": "processing",
        "DRAFTING_OUTLINE": "processing",
        "AWAITING_OUTLINE_CONFIRM": "processing",
        "GENERATING_CONTENT": "processing",
        "RENDERING": "processing",
        "SUCCESS": "completed",
        "FAILED": "failed",
    }
    return mapping.get(state, "pending")


def _to_session_ref(
    session,
    contract_version: str,
    schema_version: int,
    task_id: Optional[str] = None,
) -> dict:
    return {
        "session_id": session.id,
        "project_id": session.projectId,
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
