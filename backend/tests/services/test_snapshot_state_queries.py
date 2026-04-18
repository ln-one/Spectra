from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.snapshot_state_queries import (
    load_latest_state_event,
)


@pytest.mark.anyio
async def test_load_latest_state_event_filters_by_run_id_when_scoped():
    run_a_event = SimpleNamespace(payload='{"run_id":"run-a"}')
    run_b_event = SimpleNamespace(payload='{"run_id":"run-b"}')
    db = SimpleNamespace(
        sessionevent=SimpleNamespace(
            find_many=AsyncMock(return_value=[run_b_event, run_a_event]),
            find_first=AsyncMock(return_value=run_b_event),
        )
    )

    event = await load_latest_state_event(db, "session-1", run_id="run-a")

    assert event is run_a_event
    db.sessionevent.find_first.assert_not_called()


@pytest.mark.anyio
async def test_load_latest_state_event_uses_latest_when_not_scoped():
    latest_event = SimpleNamespace(payload='{"run_id":"run-b"}')
    db = SimpleNamespace(
        sessionevent=SimpleNamespace(
            find_first=AsyncMock(return_value=latest_event),
        )
    )

    event = await load_latest_state_event(db, "session-1", run_id=None)

    assert event is latest_event
    db.sessionevent.find_first.assert_awaited_once()
