from __future__ import annotations

import json


def is_outline_version_unique_violation(exc: Exception) -> bool:
    text = str(exc)
    return "Unique constraint failed" in text or "UniqueViolationError" in text


def normalize_outline_document(outline_data: dict, version: int) -> dict:
    normalized = dict(outline_data or {})
    normalized["version"] = version
    return normalized


def parse_outline_json(raw: object) -> dict | None:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def load_latest_outline_record(db, session_id: str):
    outline_model = getattr(db, "outlineversion", None)
    if outline_model is None or not hasattr(outline_model, "find_first"):
        return None
    return await outline_model.find_first(
        where={"sessionId": session_id},
        order={"version": "desc"},
    )


async def get_effective_outline_version(db, session) -> int:
    session_version = max(int(getattr(session, "currentOutlineVersion", 0) or 0), 0)
    latest = await load_latest_outline_record(db, session.id)
    latest_version = max(int(getattr(latest, "version", 0) or 0), 0) if latest else 0
    return max(session_version, latest_version)


async def persist_outline_version(
    *,
    db,
    session_id: str,
    version: int,
    outline_data: dict,
    change_reason: str | None,
) -> None:
    normalized = normalize_outline_document(outline_data, version)
    payload = {
        "sessionId": session_id,
        "version": version,
        "outlineData": json.dumps(normalized, ensure_ascii=False),
        "changeReason": change_reason,
    }
    try:
        await db.outlineversion.create(data=payload)
        return
    except Exception as exc:
        if not is_outline_version_unique_violation(exc):
            raise
        existing = await db.outlineversion.find_first(
            where={"sessionId": session_id, "version": version},
            order={"createdAt": "desc"},
        )
        if not existing:
            raise
        await db.outlineversion.update(
            where={"id": existing.id},
            data={
                "outlineData": payload["outlineData"],
                "changeReason": payload["changeReason"],
            },
        )
