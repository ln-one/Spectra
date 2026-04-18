from __future__ import annotations

from services.generation_session_service.snapshot_parsing import (
    parse_json_array,
    parse_json_object,
)
from services.platform.generation_event_constants import GenerationEventType


async def load_latest_state_event(db, session_id: str, run_id: str | None = None):
    event_model = getattr(db, "sessionevent", None)
    if event_model is None:
        return None
    if run_id and hasattr(event_model, "find_many"):
        scoped_events = await event_model.find_many(
            where={
                "sessionId": session_id,
                "eventType": GenerationEventType.STATE_CHANGED.value,
            },
            order={"createdAt": "desc"},
            take=100,
        )
        for event in scoped_events:
            payload = parse_json_object(getattr(event, "payload", None)) or {}
            event_run_id = str(payload.get("run_id") or "").strip()
            if event_run_id and event_run_id != run_id:
                continue
            return event
        return None

    if not hasattr(event_model, "find_first"):
        return None

    return await event_model.find_first(
        where={
            "sessionId": session_id,
            "eventType": GenerationEventType.STATE_CHANGED.value,
        },
        order={"createdAt": "desc"},
    )


def load_session_fallbacks(session) -> list[dict]:
    return parse_json_array(getattr(session, "fallbacksJson", None))
