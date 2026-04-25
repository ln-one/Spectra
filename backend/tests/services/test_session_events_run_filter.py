from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service.queries import get_events


def _make_event(cursor: str, payload: dict) -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=f"ev-{cursor}",
        schemaVersion=1,
        eventType="progress.updated",
        state="DRAFTING_OUTLINE",
        stateReason=None,
        progress=10,
        createdAt=now,
        cursor=cursor,
        payload=json.dumps(payload),
    )


@pytest.mark.anyio
async def test_get_events_filters_by_run_id_from_payload():
    event_run_a = _make_event("c1", {"run_id": "run-a", "message": "a"})
    event_run_b = _make_event("c2", {"run_id": "run-b", "message": "b"})

    db = SimpleNamespace(
        sessionevent=SimpleNamespace(
            find_unique=AsyncMock(return_value=None),
            find_many=AsyncMock(side_effect=[[event_run_a, event_run_b]]),
        )
    )

    with patch(
        "services.generation_session_service.queries.get_owned_session",
        AsyncMock(return_value=SimpleNamespace(id="s-001")),
    ):
        events = await get_events(
            db=db,
            session_id="s-001",
            user_id="u-001",
            run_id="run-b",
            limit=50,
        )

    assert len(events) == 1
    assert events[0]["cursor"] == "c2"


@pytest.mark.anyio
async def test_get_events_filters_by_run_id_from_section_payload():
    event_other = _make_event(
        "c1",
        {"section_payload": {"run_id": "run-x"}, "event_type": "outline.token"},
    )
    event_target = _make_event(
        "c2",
        {"section_payload": {"run_id": "run-y"}, "event_type": "outline.token"},
    )

    db = SimpleNamespace(
        sessionevent=SimpleNamespace(
            find_unique=AsyncMock(return_value=None),
            find_many=AsyncMock(side_effect=[[event_other, event_target]]),
        )
    )

    with patch(
        "services.generation_session_service.queries.get_owned_session",
        AsyncMock(return_value=SimpleNamespace(id="s-001")),
    ):
        events = await get_events(
            db=db,
            session_id="s-001",
            user_id="u-001",
            run_id="run-y",
            limit=50,
        )

    assert len(events) == 1
    assert events[0]["cursor"] == "c2"
