"""Event persistence helpers for generation session service."""

from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from contextlib import asynccontextmanager
from typing import Any, Optional


def _build_event_data(
    *,
    schema_version: int,
    session_id: str,
    event_type: str,
    state: str,
    state_reason: Optional[str] = None,
    progress: Optional[int] = None,
    payload: Optional[dict] = None,
) -> tuple[dict[str, Any], str]:
    cursor = str(uuid.uuid4())
    return (
        {
            "sessionId": session_id,
            "eventType": event_type,
            "state": state,
            "stateReason": state_reason,
            "progress": progress,
            "cursor": cursor,
            "payload": json.dumps(payload) if payload else None,
            "schemaVersion": schema_version,
        },
        cursor,
    )


@asynccontextmanager
async def _transaction_client(db):
    tx_factory = getattr(db, "tx", None)
    if callable(tx_factory):
        async with tx_factory() as tx:
            yield tx
        return
    yield db


async def persist_session_update_and_events(
    *,
    db,
    schema_version: int,
    session_id: str,
    session_data: Optional[dict[str, Any]] = None,
    events: Sequence[dict[str, Any]],
) -> str | None:
    """Persist session mutations and emitted events within one transaction."""
    last_cursor: str | None = None

    async with _transaction_client(db) as client:
        if session_data:
            await client.generationsession.update(
                where={"id": session_id},
                data=session_data,
            )

        for event in events:
            event_data, last_cursor = _build_event_data(
                schema_version=schema_version,
                session_id=session_id,
                event_type=str(event["event_type"]),
                state=str(event["state"]),
                state_reason=event.get("state_reason"),
                progress=event.get("progress"),
                payload=event.get("payload"),
            )
            await client.sessionevent.create(data=event_data)

        if last_cursor is not None:
            await client.generationsession.update(
                where={"id": session_id},
                data={"lastCursor": last_cursor},
            )

    return last_cursor


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
    await persist_session_update_and_events(
        db=db,
        schema_version=schema_version,
        session_id=session_id,
        events=[
            {
                "event_type": event_type,
                "state": state,
                "state_reason": state_reason,
                "progress": progress,
                "payload": payload,
            }
        ],
    )
