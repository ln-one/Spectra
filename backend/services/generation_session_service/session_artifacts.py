from __future__ import annotations

from typing import Optional

from services.generation_session_service.helpers import (
    _parse_json_object,
    _resolve_capability_from_artifact,
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


async def get_latest_session_candidate_change(
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
