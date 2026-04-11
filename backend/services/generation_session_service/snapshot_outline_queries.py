from __future__ import annotations

from typing import Optional

from services.generation_session_service.snapshot_parsing import parse_json_object
from services.platform.generation_event_constants import GenerationEventType


async def load_outline_by_version(db, session_id: str, version: int) -> Optional[dict]:
    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None

    record = await outline_model.find_first(
        where={"sessionId": session_id, "version": version},
    )
    if not record:
        return None

    parsed = parse_json_object(getattr(record, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(record, "version", parsed.get("version", version))
    return parsed


async def resolve_outline_version_by_run(
    db, session_id: str, run_id: str
) -> Optional[int]:
    event_model = getattr(db, "sessionevent", None)
    if event_model is None or not hasattr(event_model, "find_many"):
        return None

    events = await event_model.find_many(
        where={
            "sessionId": session_id,
            "eventType": GenerationEventType.OUTLINE_UPDATED.value,
        },
        order={"createdAt": "desc"},
        take=100,
    )
    for event in events:
        payload = parse_json_object(getattr(event, "payload", None))
        if not payload:
            continue
        if str(payload.get("run_id") or "").strip() != run_id:
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


async def load_latest_outline(
    db, session, run_id: Optional[str] = None
) -> Optional[dict]:
    if run_id:
        run_outline_version = await resolve_outline_version_by_run(
            db, session.id, run_id
        )
        if run_outline_version is not None:
            return await load_outline_by_version(db, session.id, run_outline_version)
        return None

    relation_versions = getattr(session, "outlineVersions", None)
    if relation_versions:
        latest = max(relation_versions, key=lambda v: v.version)
        parsed = parse_json_object(getattr(latest, "outlineData", None))
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
    parsed = parse_json_object(getattr(latest, "outlineData", None))
    if parsed is not None:
        parsed["version"] = getattr(latest, "version", parsed.get("version", 1))
    return parsed
