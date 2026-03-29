from __future__ import annotations

import asyncio
import json
from typing import Optional

from schemas.generation import build_generation_result_payload
from services.generation_session_service.access import get_owned_session
from services.generation_session_service.capability_helpers import _default_capabilities
from services.generation_session_service.run_queries import get_session_run
from services.generation_session_service.serialization_helpers import (
    _to_generation_event,
    _to_session_ref,
    _to_session_run,
)
from services.generation_session_service.session_artifacts import (
    get_latest_session_candidate_change,
    get_session_artifact_history,
)
from services.generation_session_service.session_history import get_latest_session_run
from services.generation_session_service.snapshot_consistency import (
    validate_session_snapshot_contract,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState


def _parse_json_object(raw: object) -> Optional[dict]:
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _parse_json_array(raw: object) -> list[dict]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if not isinstance(raw, str):
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


async def _load_outline_by_version(db, session_id: str, version: int) -> Optional[dict]:
    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None

    record = await outline_model.find_first(
        where={"sessionId": session_id, "version": version},
    )
    if not record:
        return None

    parsed = _parse_json_object(getattr(record, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(record, "version", parsed.get("version", version))
    return parsed


async def _resolve_outline_version_by_run(
    db, session_id: str, run_id: str
) -> Optional[int]:
    task_model = getattr(db, "generationtask", None)
    if task_model is None or not hasattr(task_model, "find_many"):
        return None

    tasks = await task_model.find_many(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=100,
    )

    for task in tasks:
        parsed = _parse_json_object(getattr(task, "inputData", None))
        if not parsed:
            continue
        if str(parsed.get("run_id") or "") != run_id:
            continue
        version = parsed.get("outline_version")
        if isinstance(version, bool):
            continue
        try:
            parsed_version = int(version)
        except (TypeError, ValueError):
            continue
        if parsed_version >= 1:
            return parsed_version
    event_model = getattr(db, "sessionevent", None)
    if event_model is not None and hasattr(event_model, "find_many"):
        events = await event_model.find_many(
            where={
                "sessionId": session_id,
                "eventType": GenerationEventType.OUTLINE_UPDATED.value,
            },
            order={"createdAt": "desc"},
            take=100,
        )
        for event in events:
            payload = _parse_json_object(getattr(event, "payload", None))
            if not payload:
                continue
            if str(payload.get("run_id") or "") != run_id:
                continue
            version = payload.get("version")
            if isinstance(version, bool):
                continue
            try:
                parsed_version = int(version)
            except (TypeError, ValueError):
                continue
            if parsed_version >= 1:
                return parsed_version

    return None


async def _load_latest_outline(
    db, session, run_id: Optional[str] = None
) -> Optional[dict]:
    if run_id:
        run_outline_version = await _resolve_outline_version_by_run(
            db, session.id, run_id
        )
        if run_outline_version is not None:
            run_outline = await _load_outline_by_version(
                db, session.id, run_outline_version
            )
            if run_outline is not None:
                return run_outline
        # With explicit run scope, never fall back to another run's latest outline.
        # Returning None here keeps run isolation strict and prevents stale carry-over.
        return None

    relation_versions = getattr(session, "outlineVersions", None)
    if relation_versions:
        latest = max(relation_versions, key=lambda v: v.version)
        parsed = _parse_json_object(getattr(latest, "outlineData", None))
        if parsed is not None:
            parsed["version"] = getattr(latest, "version", parsed.get("version", 1))
        return parsed

    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None

    latest = await outline_model.find_first(
        where={"sessionId": session.id},
        order={"version": "desc"},
    )
    if not latest:
        return None
    parsed = _parse_json_object(getattr(latest, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(latest, "version", parsed.get("version", 1))
    return parsed


async def _load_latest_task_id(db, session) -> Optional[str]:
    relation_tasks = getattr(session, "tasks", None)
    if relation_tasks:
        latest_task = max(relation_tasks, key=lambda t: t.createdAt)
        return latest_task.id

    task_model = getattr(db, "generationtask", None)
    if task_model is None or not hasattr(task_model, "find_first"):
        return None

    latest = await task_model.find_first(
        where={"sessionId": session.id},
        order={"createdAt": "desc"},
    )
    return getattr(latest, "id", None) if latest else None


async def get_session_snapshot(
    *,
    db,
    guard,
    session_id: str,
    user_id: str,
    contract_version: str,
    schema_version: int,
    run_id: Optional[str] = None,
) -> dict:
    session = await get_owned_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
    )

    async def _load_latest_state_event():
        event_model = getattr(db, "sessionevent", None)
        if event_model is None or not hasattr(event_model, "find_first"):
            return None
        if run_id and hasattr(event_model, "find_many"):
            run_events = await event_model.find_many(
                where={
                    "sessionId": session.id,
                    "eventType": GenerationEventType.STATE_CHANGED.value,
                },
                order={"createdAt": "desc"},
                take=100,
            )
            for event in run_events:
                payload = _parse_json_object(getattr(event, "payload", None))
                if not payload:
                    continue
                if str(payload.get("run_id") or "") == run_id:
                    return event
            return None
        return await event_model.find_first(
            where={
                "sessionId": session.id,
                "eventType": GenerationEventType.STATE_CHANGED.value,
            },
            order={"createdAt": "desc"},
        )

    (
        outline,
        latest_task_id,
        artifact_history,
        latest_candidate_change,
        current_run,
        latest_state_event,
    ) = await asyncio.gather(
        _load_latest_outline(db, session, run_id),
        _load_latest_task_id(db, session),
        get_session_artifact_history(
            db=db,
            project_id=session.projectId,
            session_id=session.id,
        ),
        get_latest_session_candidate_change(
            db=db,
            project_id=session.projectId,
            session_id=session.id,
        ),
        (
            get_session_run(db, session.id, run_id)
            if run_id
            else get_latest_session_run(db, session.id)
        ),
        _load_latest_state_event(),
    )
    fallbacks = _parse_json_array(getattr(session, "fallbacksJson", None))
    snapshot = {
        "session": _to_session_ref(
            session,
            contract_version,
            schema_version,
            task_id=latest_task_id,
        ),
        "options": _parse_json_object(getattr(session, "options", None)),
        "outline": outline,
        "context_snapshot": None,
        "capabilities": _default_capabilities(),
        "fallbacks": fallbacks,
        "artifact_id": artifact_history["artifact_id"],
        "based_on_version_id": artifact_history["based_on_version_id"],
        "current_version_id": artifact_history["current_version_id"],
        "upstream_updated": artifact_history["upstream_updated"],
        "artifact_anchor": artifact_history["artifact_anchor"],
        "latest_candidate_change": latest_candidate_change,
        "session_artifacts": artifact_history["session_artifacts"],
        "session_artifact_groups": artifact_history["session_artifact_groups"],
        "allowed_actions": guard.get_allowed_actions(session.state),
        "current_run": _to_session_run(current_run),
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
    validate_session_snapshot_contract(
        session=session,
        snapshot=snapshot,
        latest_state_event=latest_state_event,
    )
    return snapshot


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
