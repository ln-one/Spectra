from __future__ import annotations

from types import SimpleNamespace
from typing import Optional

from services.generation_session_service.capability_helpers import (
    _resolve_capability_from_artifact,
)
from services.preview_helpers import build_artifact_anchor
from services.project_space_service.candidate_change_semantics import (
    parse_json_object,
    serialize_candidate_change,
)

_ARTIFACT_HISTORY_SELECT = {
    "id": True,
    "type": True,
    "basedOnVersionId": True,
    "metadata": True,
    "createdAt": True,
    "updatedAt": True,
}


def _project_artifact_fields(artifact, select: dict | None = None):
    if not select:
        return artifact

    projected: dict = {}
    for field_name, enabled in select.items():
        if not enabled:
            continue
        if isinstance(artifact, dict):
            projected[field_name] = artifact.get(field_name)
        else:
            projected[field_name] = getattr(artifact, field_name, None)
    return SimpleNamespace(**projected)


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
    return serialize_candidate_change(change, isoformat_datetimes=True)


def _artifact_lineage_flags(
    metadata: dict | None,
) -> tuple[str | None, str | None]:
    payload = metadata or {}
    return (
        payload.get("replaces_artifact_id"),
        payload.get("superseded_by_artifact_id"),
    )


def _history_sort_key(item: dict) -> tuple[bool, bool, str]:
    return (
        not bool(item.get("superseded_by_artifact_id")),
        item.get("capability") == "outline",
        item.get("updated_at") or "",
    )


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

    artifact_query = artifact_model.find_many(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
    )
    artifacts = [
        _project_artifact_fields(artifact, _ARTIFACT_HISTORY_SELECT)
        for artifact in await artifact_query
    ]

    history_items: list[dict] = []
    grouped: dict[str, list[dict]] = {}

    for artifact in artifacts:
        metadata = parse_json_object(getattr(artifact, "metadata", None))
        capability = _resolve_capability_from_artifact(
            artifact_type=getattr(artifact, "type", ""),
            metadata=metadata,
        )
        replaces_artifact_id, superseded_by_artifact_id = _artifact_lineage_flags(
            metadata
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
            "replaces_artifact_id": replaces_artifact_id,
            "superseded_by_artifact_id": superseded_by_artifact_id,
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

    history_items.sort(key=_history_sort_key, reverse=True)
    for items in grouped.values():
        items.sort(
            key=lambda item: (
                not bool(item.get("superseded_by_artifact_id")),
                item.get("updated_at") or "",
            ),
            reverse=True,
        )

    grouped_items = [
        {
            "capability": capability,
            "count": len(items),
            "items": items,
            "artifacts": items,
        }
        for capability, items in grouped.items()
    ]
    latest_artifact = history_items[0] if history_items else None
    return {
        "session_artifacts": history_items,
        "session_artifact_groups": grouped_items,
        "artifact_id": latest_artifact.get("artifact_id") if latest_artifact else None,
        "based_on_version_id": (
            latest_artifact.get("based_on_version_id") if latest_artifact else None
        ),
        "artifact_anchor": (
            latest_artifact.get("artifact_anchor")
            if latest_artifact
            else build_artifact_anchor(session_id, None)
        ),
    }
