from __future__ import annotations

import asyncio
from typing import Optional

from services.database.prisma_compat import (
    find_many_with_select_fallback,
    find_unique_with_select_fallback,
)
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
) -> tuple[bool, str | None, str | None]:
    payload = metadata or {}
    return (
        bool(payload.get("is_current", True)),
        payload.get("replaces_artifact_id"),
        payload.get("superseded_by_artifact_id"),
    )


def _history_sort_key(item: dict) -> tuple[bool, bool, str]:
    return (
        bool(item.get("is_current", True)),
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
            "current_version_id": None,
            "upstream_updated": False,
            "artifact_anchor": build_artifact_anchor(session_id, None),
        }

    artifact_query = find_many_with_select_fallback(
        model=artifact_model,
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
        select=_ARTIFACT_HISTORY_SELECT,
    )
    if hasattr(db, "project") and hasattr(db.project, "find_unique"):
        artifacts, project = await asyncio.gather(
            artifact_query,
            find_unique_with_select_fallback(
                model=db.project,
                where={"id": project_id},
                select={"currentVersionId": True},
            ),
        )
    elif hasattr(db, "get_project"):
        artifacts, project = await asyncio.gather(
            artifact_query,
            db.get_project(project_id),
        )
    else:
        artifacts = await artifact_query
        project = None
    current_version_id = getattr(project, "currentVersionId", None) if project else None

    history_items: list[dict] = []
    grouped: dict[str, list[dict]] = {}

    for artifact in artifacts:
        metadata = parse_json_object(getattr(artifact, "metadata", None))
        capability = _resolve_capability_from_artifact(
            artifact_type=getattr(artifact, "type", ""),
            metadata=metadata,
        )
        is_current, replaces_artifact_id, superseded_by_artifact_id = (
            _artifact_lineage_flags(metadata)
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
            "current_version_id": current_version_id,
            "upstream_updated": bool(
                getattr(artifact, "basedOnVersionId", None)
                and current_version_id
                and getattr(artifact, "basedOnVersionId", None) != current_version_id
            ),
            "is_current": is_current,
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
                bool(item.get("is_current", True)),
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
        "current_version_id": current_version_id,
        "upstream_updated": bool(
            latest_artifact
            and latest_artifact.get("based_on_version_id")
            and current_version_id
            and latest_artifact.get("based_on_version_id") != current_version_id
        ),
        "artifact_anchor": (
            latest_artifact.get("artifact_anchor")
            if latest_artifact
            else build_artifact_anchor(session_id, None)
        ),
    }
