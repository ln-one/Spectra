"""Event persistence helpers for generation session service."""

import json
import uuid
from typing import Optional


async def append_event(
    db,
    schema_version: int,
    session_id: str,
    event_type: str,
    state: str,
    state_reason: Optional[str] = None,
    progress: Optional[int] = None,
    payload: Optional[dict] = None,
) -> None:
    """Append immutable session event and update last cursor."""
    cursor = str(uuid.uuid4())
    await db.sessionevent.create(
        data={
            "sessionId": session_id,
            "eventType": event_type,
            "state": state,
            "stateReason": state_reason,
            "progress": progress,
            "cursor": cursor,
            "payload": json.dumps(payload) if payload else None,
            "schemaVersion": schema_version,
        }
    )
    await db.generationsession.update(
        where={"id": session_id},
        data={"lastCursor": cursor},
    )
