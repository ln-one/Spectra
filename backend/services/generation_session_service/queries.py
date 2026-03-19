from __future__ import annotations

import json
from typing import Optional

from services.generation_session_service.helpers import (
    _default_capabilities,
    _parse_json_object,
    _resolve_capability_from_artifact,
    _to_generation_event,
    _to_session_ref,
)
from services.preview_helpers import build_artifact_anchor


def _resolve_session_artifact_title(
    *, artifact_id: str, capability: str, metadata: dict
) -> str:
    title = (metadata or {}).get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()

    for key in ("name", "filename"):
        candidate = (metadata or {}).get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    short_id = str(artifact_id or "").strip()
    if len(short_id) > 8:
        short_id = short_id[:8]
    normalized_capability = str(capability or "").strip() or "artifact"
    return f"{normalized_capability}-{short_id or 'unknown'}"


def _serialize_candidate_change(change) -> dict:
    payload = _parse_json_object(getattr(change, "payload", None))
    review = payload.get("review") if isinstance(payload, dict) else None
    accepted_version_id = (
        review.get("accepted_version_id") if isinstance(review, dict) else None
    )
    return {
        "id": change.id,
        "project_id": change.projectId,
        "session_id": change.sessionId,
        "base_version_id": change.baseVersionId,
        "title": change.title,
        "summary": change.summary,
        "payload": payload or None,
        "status": change.status,
        "review_comment": getattr(change, "reviewComment", None),
        "accepted_version_id": accepted_version_id,
        "proposer_user_id": change.proposerUserId,
        "created_at": (
            change.createdAt.isoformat() if getattr(change, "createdAt", None) else None
        ),
        "updated_at": (
            change.updatedAt.isoformat() if getattr(change, "updatedAt", None) else None
        ),
    }


async def _get_latest_session_candidate_change(
    *, db, project_id: str, session_id: str
) -> Optional[dict]:
    candidate_model = getattr(db, "candidatechange", None)
    if candidate_model is None or not hasattr(candidate_model, "find_first"):
        return None

    change = await candidate_model.find_first(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
    )
    if not change:
        return None
    return _serialize_candidate_change(change)


async def get_session_artifact_history(
    *,
    db,
    project_id: str,
    session_id: str,
) -> dict:
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "find_many"):
        return {
            "session_artifacts": [],
            "session_artifact_groups": [],
            "artifact_id": None,
            "based_on_version_id": None,
            "artifact_anchor": build_artifact_anchor(session_id, None),
        }

    artifacts = await artifact_model.find_many(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
    )

    history_items: list[dict] = []
    grouped: dict[str, list[dict]] = {}

    for artifact in artifacts:
        metadata = _parse_json_object(getattr(artifact, "metadata", None))
        capability = _resolve_capability_from_artifact(
            artifact_type=getattr(artifact, "type", ""),
            metadata=metadata,
        )
        item = {
            "artifact_id": artifact.id,
            "type": getattr(artifact, "type", None),
            "capability": capability,
            "title": _resolve_session_artifact_title(
                artifact_id=artifact.id,
                capability=capability,
                metadata=metadata,
            ),
            "based_on_version_id": getattr(artifact, "basedOnVersionId", None),
            "artifact_anchor": build_artifact_anchor(session_id, artifact),
            "created_at": (
                artifact.createdAt.isoformat()
                if getattr(artifact, "createdAt", None)
                else None
            ),
            "updated_at": (
                artifact.updatedAt.isoformat()
                if getattr(artifact, "updatedAt", None)
                else None
            ),
            "metadata": metadata,
        }
        history_items.append(item)
        grouped.setdefault(capability, []).append(item)

    grouped_items = [
        {
            "capability": capability,
            "count": len(items),
            "items": items,
            "artifacts": items,
        }
        for capability, items in grouped.items()
    ]
    latest_artifact = artifacts[0] if artifacts else None
    return {
        "session_artifacts": history_items,
        "session_artifact_groups": grouped_items,
        "artifact_id": getattr(latest_artifact, "id", None),
        "based_on_version_id": getattr(latest_artifact, "basedOnVersionId", None),
        "artifact_anchor": build_artifact_anchor(session_id, latest_artifact),
    }


async def get_session_snapshot(
    *,
    db,
    guard,
    session_id: str,
    user_id: str,
    contract_version: str,
    schema_version: int,
) -> dict:
    session = await db.generationsession.find_unique(
        where={"id": session_id},
        include={"outlineVersions": True, "tasks": True},
    )
    if session is None:
        raise ValueError(f"Session not found: {session_id}")
    if session.userId != user_id:
        raise PermissionError("无权访问该会话")

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
    latest_candidate_change = await _get_latest_session_candidate_change(
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
            {
                "ppt_url": session.pptUrl,
                "word_url": session.wordUrl,
                "version": session.renderVersion,
            }
            if session.state == "SUCCESS"
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
            if session.state == "FAILED" and session.errorCode
            else None
        ),
    }


async def get_session_runtime_state(
    *,
    db,
    session_id: str,
    user_id: str,
) -> dict:
    session = await db.generationsession.find_unique(
        where={"id": session_id},
        select={
            "userId": True,
            "state": True,
            "lastCursor": True,
            "updatedAt": True,
        },
    )
    if session is None:
        raise ValueError(f"Session not found: {session_id}")

    owner_id = session.get("userId") if isinstance(session, dict) else session.userId
    if owner_id != user_id:
        raise PermissionError("无权访问该会话")

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
    session = await db.generationsession.find_unique(where={"id": session_id})
    if session is None:
        raise ValueError(f"Session not found: {session_id}")
    if session.userId != user_id:
        raise PermissionError("无权访问该会话")

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
