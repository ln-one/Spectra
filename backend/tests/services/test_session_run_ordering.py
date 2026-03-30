from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.run_queries import list_session_runs
from services.generation_session_service.session_history import get_latest_session_run


@pytest.mark.anyio
async def test_get_latest_session_run_orders_by_created_at_desc():
    now = datetime.now(timezone.utc)
    run = SimpleNamespace(id="run-001", createdAt=now)
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_first=AsyncMock(return_value=run))
    )

    result = await get_latest_session_run(db, "s-001")

    assert result is run
    db.sessionrun.find_first.assert_awaited_once_with(
        where={"sessionId": "s-001"},
        order={"createdAt": "desc"},
    )


@pytest.mark.anyio
async def test_list_session_runs_orders_by_created_at_desc():
    now = datetime.now(timezone.utc)
    run = SimpleNamespace(
        id="run-001",
        sessionId="s-001",
        projectId="p-001",
        toolType="ppt_generate",
        runNo=1,
        title="Run 1",
        titleSource="pending",
        status="processing",
        step="outline",
        artifactId=None,
        createdAt=now,
        updatedAt=now,
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(
            find_many=AsyncMock(return_value=[run]),
            count=AsyncMock(return_value=1),
        )
    )

    payload = await list_session_runs(db=db, session_id="s-001", page=1, limit=20)

    assert payload["total"] == 1
    assert payload["runs"][0]["run_id"] == "run-001"
    db.sessionrun.find_many.assert_awaited_once_with(
        where={"sessionId": "s-001"},
        order={"createdAt": "desc"},
        skip=0,
        take=20,
    )
