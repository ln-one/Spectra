from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, call

import pytest

from services.generation_session_service.event_store import (
    append_event,
    persist_session_update_and_events,
)


class _FakeTxContext:
    def __init__(self, client) -> None:
        self._client = client

    async def __aenter__(self):
        return self._client

    async def __aexit__(self, exc_type, exc, tb):
        return None


@pytest.mark.anyio
async def test_persist_session_update_and_events_uses_transaction_and_updates_last_cursor(
    monkeypatch,
):
    cursors = iter(["cursor-1", "cursor-2"])
    monkeypatch.setattr(
        "services.generation_session_service.event_store.uuid.uuid4",
        lambda: next(cursors),
    )

    tx_client = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    db = SimpleNamespace(tx=lambda: _FakeTxContext(tx_client))

    last_cursor = await persist_session_update_and_events(
        db=db,
        schema_version=1,
        session_id="sess-001",
        session_data={"state": "SUCCESS", "stateReason": "completed"},
        events=[
            {
                "event_type": "task.completed",
                "state": "SUCCESS",
                "payload": {"step": "render"},
            },
            {
                "event_type": "state.changed",
                "state": "SUCCESS",
                "state_reason": "completed",
            },
        ],
    )

    assert last_cursor == "cursor-2"
    assert tx_client.generationsession.update.await_args_list == [
        call(
            where={"id": "sess-001"},
            data={"state": "SUCCESS", "stateReason": "completed"},
        ),
        call(where={"id": "sess-001"}, data={"lastCursor": "cursor-2"}),
    ]
    assert tx_client.sessionevent.create.await_count == 2
    first_event = tx_client.sessionevent.create.await_args_list[0].kwargs["data"]
    second_event = tx_client.sessionevent.create.await_args_list[1].kwargs["data"]
    assert first_event["cursor"] == "cursor-1"
    assert second_event["cursor"] == "cursor-2"
    assert second_event["stateReason"] == "completed"


@pytest.mark.anyio
async def test_append_event_supports_db_doubles_without_transaction(monkeypatch):
    monkeypatch.setattr(
        "services.generation_session_service.event_store.uuid.uuid4",
        lambda: "cursor-direct",
    )

    db = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )

    await append_event(
        db=db,
        schema_version=1,
        session_id="sess-002",
        event_type="state.changed",
        state="FAILED",
        state_reason="failed_permanent_error",
        payload={"error_code": "E-001"},
    )

    db.sessionevent.create.assert_awaited_once()
    db.generationsession.update.assert_awaited_once_with(
        where={"id": "sess-002"},
        data={"lastCursor": "cursor-direct"},
    )
