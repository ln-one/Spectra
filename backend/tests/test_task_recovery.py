"""Unit tests for TaskRecoveryService."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_recovery import TaskRecoveryService


@pytest.mark.asyncio
async def test_is_session_already_running_true():
    db = SimpleNamespace(
        generationtask=SimpleNamespace(count=AsyncMock(return_value=1))
    )
    service = TaskRecoveryService(db)

    result = await service.is_session_already_running("s-001")

    assert result is True
    db.generationtask.count.assert_awaited_once_with(
        where={"sessionId": "s-001", "status": {"in": ["processing", "pending"]}}
    )


@pytest.mark.asyncio
async def test_replay_failed_task_success():
    task = SimpleNamespace(id="t-001", status="failed", retryCount=2)
    db = SimpleNamespace(
        generationtask=SimpleNamespace(
            find_unique=AsyncMock(return_value=task),
            update=AsyncMock(return_value=task),
        )
    )
    service = TaskRecoveryService(db)

    ok = await service.replay_failed_task("t-001")

    assert ok is True
    db.generationtask.update.assert_awaited_once()


@pytest.mark.asyncio
async def test_recover_stale_tasks_updates_task_and_session():
    stale_task = SimpleNamespace(
        id="t-001",
        projectId="p-001",
        sessionId="s-001",
        updatedAt=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    session = SimpleNamespace(id="s-001", state="ANALYZING")

    db = SimpleNamespace(
        generationtask=SimpleNamespace(
            find_many=AsyncMock(return_value=[stale_task]),
            update=AsyncMock(),
        ),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(return_value=session),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = TaskRecoveryService(db)

    summary = await service.recover_stale_tasks(dry_run=False)

    assert summary == {"scanned": 1, "recovered": 1, "session_updated": 1}
    db.generationtask.update.assert_awaited_once()
    db.generationsession.update.assert_awaited_once()
    db.sessionevent.create.assert_awaited_once()
