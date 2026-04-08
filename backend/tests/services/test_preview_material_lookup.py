from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.preview_helpers.material_lookup import resolve_task_by_run


@pytest.mark.asyncio
async def test_resolve_task_by_run_loads_candidates_lightly_before_full_task_fetch(
    monkeypatch,
):
    run_model = SimpleNamespace(
        find_unique=AsyncMock(
            return_value=SimpleNamespace(
                id="run-001",
                sessionId="session-001",
                artifactId=None,
            )
        )
    )
    generationtask_model = SimpleNamespace()
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            sessionrun=run_model,
            generationtask=generationtask_model,
        )
    )

    find_many_mock = AsyncMock(
        return_value=[
            SimpleNamespace(id="task-002", sessionId="session-001"),
            SimpleNamespace(id="task-001", sessionId="session-001"),
        ]
    )
    find_unique_mock = AsyncMock(
        side_effect=[
            SimpleNamespace(
                id="task-002",
                sessionId="session-001",
                status="processing",
                templateConfig=None,
                inputData='{"run_id":"run-other"}',
            ),
            SimpleNamespace(
                id="task-001",
                sessionId="session-001",
                status="processing",
                templateConfig=None,
                inputData='{"run_id":"run-001"}',
            ),
        ]
    )

    monkeypatch.setattr(
        "services.preview_helpers.material_lookup.find_many_with_select_fallback",
        find_many_mock,
    )
    monkeypatch.setattr(
        "services.preview_helpers.material_lookup.find_unique_with_select_fallback",
        find_unique_mock,
    )

    task = await resolve_task_by_run(db_service, "session-001", "run-001")

    assert task is not None
    assert task.id == "task-001"
    assert find_many_mock.await_args.kwargs["select"] == {
        "id": True,
        "sessionId": True,
    }
    assert find_unique_mock.await_args_list[0].kwargs["where"] == {"id": "task-002"}
    assert find_unique_mock.await_args_list[1].kwargs["where"] == {"id": "task-001"}
