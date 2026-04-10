from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.preview_helpers.material_lookup import (
    resolve_task_by_artifact,
    resolve_task_by_run,
)


@pytest.mark.asyncio
async def test_resolve_task_by_run_matches_full_task_without_select(
    monkeypatch,
):
    async def _run_find_unique(**kwargs):
        assert "select" not in kwargs
        return SimpleNamespace(
            id="run-001",
            sessionId="session-001",
            artifactId=None,
        )

    run_model = SimpleNamespace(find_unique=AsyncMock(side_effect=_run_find_unique))

    async def _find_many(**kwargs):
        assert kwargs == {
            "where": {"sessionId": "session-001"},
            "order": {"createdAt": "desc"},
            "take": 50,
        }
        assert "select" not in kwargs
        return [
            SimpleNamespace(id="task-002", sessionId="session-001"),
            SimpleNamespace(id="task-001", sessionId="session-001"),
        ]

    find_many_mock = AsyncMock(side_effect=_find_many)

    async def _find_unique(**kwargs):
        assert "select" not in kwargs
        task_id = kwargs["where"]["id"]
        if task_id == "task-002":
            return SimpleNamespace(
                id="task-002",
                sessionId="session-001",
                status="processing",
                templateConfig=None,
                inputData='{"run_id":"run-other"}',
            )
        if task_id == "task-001":
            return SimpleNamespace(
                id="task-001",
                sessionId="session-001",
                status="processing",
                templateConfig=None,
                inputData='{"run_id":"run-001"}',
            )
        return None

    find_unique_mock = AsyncMock(side_effect=_find_unique)
    generationtask_model = SimpleNamespace(
        find_many=find_many_mock,
        find_unique=find_unique_mock,
    )
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            sessionrun=run_model,
            generationtask=generationtask_model,
        )
    )

    task = await resolve_task_by_run(db_service, "session-001", "run-001")

    assert task is not None
    assert task.id == "task-001"
    assert find_unique_mock.await_args_list[0].kwargs == {"where": {"id": "task-002"}}
    assert find_unique_mock.await_args_list[1].kwargs == {"where": {"id": "task-001"}}


@pytest.mark.asyncio
async def test_resolve_task_by_artifact_avoids_select_with_legacy_prisma():
    async def _artifact_find_unique(**kwargs):
        assert kwargs == {"where": {"id": "art-001"}}
        return SimpleNamespace(
            id="art-001",
            sessionId="session-001",
            metadata='{"task_id":"task-001"}',
            storagePath=None,
        )

    async def _task_find_unique(**kwargs):
        assert kwargs == {"where": {"id": "task-001"}}
        return SimpleNamespace(
            id="task-001",
            sessionId="session-001",
            status="completed",
            templateConfig=None,
            inputData=None,
        )

    db_service = SimpleNamespace(
        db=SimpleNamespace(
            artifact=SimpleNamespace(
                find_unique=AsyncMock(side_effect=_artifact_find_unique)
            ),
            generationtask=SimpleNamespace(
                find_unique=AsyncMock(side_effect=_task_find_unique)
            ),
        )
    )

    task = await resolve_task_by_artifact(db_service, "session-001", "art-001")

    assert task is not None
    assert task.id == "task-001"
