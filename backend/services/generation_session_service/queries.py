from __future__ import annotations

import json
from typing import Optional

from schemas.generation import build_generation_result_payload
from services.generation_session_service.access import get_owned_session
from services.generation_session_service.capability_helpers import _default_capabilities
from services.generation_session_service.serialization_helpers import (
    _to_generation_event,
    _to_session_ref,
)
from services.generation_session_service.session_artifacts import (
    get_latest_session_candidate_change,
    get_session_artifact_history,
)
from services.platform.state_transition_guard import GenerationState


async def get_session_snapshot(
    *,
    db,
    guard,
    session_id: str,
    user_id: str,
    contract_version: str,
    schema_version: int,
) -> dict:
    session = await get_owned_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
        include={"outlineVersions": True, "tasks": True},
    )

    outline = None
    if session.outlineVersions:
        latest = max(session.outlineVersions, key=lambda v: v.version)
        try:
            outline = json.loads(latest.outlineData)
        except (json.JSONDecodeError, AttributeError):
            outline = None

    fallbacks = []
    if session.fallbacksJson:
        try:
            fallbacks = json.loads(session.fallbacksJson)
        except json.JSONDecodeError:
            fallbacks = []

    latest_task_id = None
    if session.tasks:
        latest_task = max(session.tasks, key=lambda t: t.createdAt)
        latest_task_id = latest_task.id

    artifact_history = await get_session_artifact_history(
        db=db,
        project_id=session.projectId,
        session_id=session.id,
    )
    latest_candidate_change = await get_latest_session_candidate_change(
        db=db,
        project_id=session.projectId,
        session_id=session.id,
    )

    return {
        "session": _to_session_ref(
            session,
            contract_version,
            schema_version,
            task_id=latest_task_id,
        ),
        "options": json.loads(session.options) if session.options else None,
        "outline": outline,
        "context_snapshot": None,
        "capabilities": _default_capabilities(),
        "fallbacks": fallbacks,
        "artifact_id": artifact_history["artifact_id"],
        "based_on_version_id": artifact_history["based_on_version_id"],
        "artifact_anchor": artifact_history["artifact_anchor"],
        "latest_candidate_change": latest_candidate_change,
        "session_artifacts": artifact_history["session_artifacts"],
        "session_artifact_groups": artifact_history["session_artifact_groups"],
        "allowed_actions": guard.get_allowed_actions(session.state),
        "result": (
            build_generation_result_payload(
                ppt_url=session.pptUrl,
                word_url=session.wordUrl,
                version=session.renderVersion,
            )
            if session.state == GenerationState.SUCCESS.value
            else None
        ),
        "error": (
            {
                "code": session.errorCode,
                "message": session.errorMessage,
                "retryable": session.errorRetryable,
                "fallback": None,
                "transition_guard": "StateTransitionGuard",
            }
            if session.state == GenerationState.FAILED.value and session.errorCode
            else None
        ),
    }


async def get_session_runtime_state(
    *,
    db,
    session_id: str,
    user_id: str,
) -> dict:
    session = await get_owned_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
        select={"userId": True, "state": True, "lastCursor": True, "updatedAt": True},
    )

    state = session.get("state") if isinstance(session, dict) else session.state
    last_cursor = (
        session.get("lastCursor") if isinstance(session, dict) else session.lastCursor
    )
    updated_at = (
        session.get("updatedAt") if isinstance(session, dict) else session.updatedAt
    )
    return {
        "state": state,
        "last_cursor": last_cursor,
        "updated_at": updated_at,
    }


async def get_events(
    *,
    db,
    session_id: str,
    user_id: str,
    cursor: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    await get_owned_session(db=db, session_id=session_id, user_id=user_id)

    where: dict = {"sessionId": session_id}
    if cursor:
        pivot = await db.sessionevent.find_unique(where={"cursor": cursor})
        if pivot and getattr(pivot, "sessionId", None) == session_id:
            where["createdAt"] = {"gt": pivot.createdAt}

    events = await db.sessionevent.find_many(
        where=where,
        order={"createdAt": "asc"},
        take=limit,
    )

    return [_to_generation_event(e) for e in events]
