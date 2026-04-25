from __future__ import annotations

from typing import Awaitable, Callable

from services.generation_session_service.event_store import (
    persist_session_update_and_events,
)
from services.platform.generation_event_constants import GenerationEventType


async def handle_resume_session(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
) -> None:
    cursor = command.get("cursor")
    await persist_session_update_and_events(
        db=db,
        schema_version=1,
        session_id=session.id,
        session_data={
            "state": new_state,
            "stateReason": getattr(session, "stateReason", None),
            "resumable": True,
            "lastCursor": cursor,
            "errorCode": None,
            "errorMessage": None,
        },
        events=[
            {
                "event_type": GenerationEventType.STATE_CHANGED.value,
                "state": new_state,
                "state_reason": getattr(session, "stateReason", None),
                "payload": {"resumed_from_cursor": cursor},
            },
            {
                "event_type": GenerationEventType.SESSION_RECOVERED.value,
                "state": new_state,
                "payload": {"resumed_from_cursor": cursor},
            },
        ],
    )
