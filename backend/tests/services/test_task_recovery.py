"""Unit tests for TaskRecoveryService."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.platform.generation_event_constants import GenerationEventType
from services.platform.recovery_constants import RecoveryErrorCode, RecoveryStateReason
from services.platform.state_transition_guard import GenerationState
from services.platform.task_recovery import TaskRecoveryService


@pytest.mark.asyncio
async def test_is_session_already_running_true():
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    state=GenerationState.GENERATING_CONTENT.value
                )
            )
        )
    )
    service = TaskRecoveryService(db)

    result = await service.is_session_already_running("s-001")

    assert result is True
    db.sessionrun.find_first.assert_awaited_once_with(
        where={"sessionId": "s-001"},
        order={"createdAt": "desc"},
    )
    db.generationsession.find_unique.assert_awaited_once_with(where={"id": "s-001"})


@pytest.mark.asyncio
async def test_is_session_already_running_false_for_terminal_state():
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(state=GenerationState.SUCCESS.value)
            )
        )
    )
    service = TaskRecoveryService(db)

    result = await service.is_session_already_running("s-001")

    assert result is False


@pytest.mark.asyncio
async def test_is_session_already_running_prefers_latest_run_status():
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(
            find_first=AsyncMock(return_value=SimpleNamespace(status="processing"))
        ),
        generationsession=SimpleNamespace(find_unique=AsyncMock()),
    )
    service = TaskRecoveryService(db)

    result = await service.is_session_already_running("s-001")

    assert result is True
    db.generationsession.find_unique.assert_not_called()


@pytest.mark.asyncio
async def test_recover_stale_tasks_updates_session_and_event():
    stale_session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        state=GenerationState.GENERATING_CONTENT.value,
        updatedAt=datetime.now(timezone.utc) - timedelta(hours=2),
    )

    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_many=AsyncMock(return_value=[stale_session]),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = TaskRecoveryService(db)

    summary = await service.recover_stale_tasks(dry_run=False)

    assert summary == {
        "scanned": 1,
        "recovered": 1,
        "session_updated": 1,
        "run_repaired": 0,
    }
    assert db.generationsession.update.await_count == 2
    db.sessionevent.create.assert_awaited_once()
    first_update = db.generationsession.update.await_args_list[0].kwargs["data"]
    assert first_update["state"] == GenerationState.FAILED.value
    assert first_update["errorCode"] == RecoveryErrorCode.WORKER_INTERRUPTED.value
    assert first_update["stateReason"] == RecoveryStateReason.WORKER_INTERRUPTED.value
    event_payload = db.sessionevent.create.await_args.kwargs["data"]
    assert event_payload["eventType"] == GenerationEventType.TASK_FAILED.value
    assert event_payload["stateReason"] == RecoveryStateReason.WORKER_INTERRUPTED.value


@pytest.mark.asyncio
async def test_recover_stale_tasks_skips_session_with_materialized_output():
    stale_run = SimpleNamespace(
        id="run-001",
        status="processing",
        updatedAt=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    stale_session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        state=GenerationState.RENDERING.value,
        updatedAt=datetime.now(timezone.utc) - timedelta(hours=2),
        pptUrl="/api/v1/download",
        wordUrl=None,
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_many=AsyncMock(return_value=[stale_session]),
            update=AsyncMock(),
        ),
        sessionrun=SimpleNamespace(
            find_first=AsyncMock(return_value=stale_run),
            update=AsyncMock(),
        ),
        sessionevent=SimpleNamespace(create=AsyncMock()),
    )
    service = TaskRecoveryService(db)

    summary = await service.recover_stale_tasks(dry_run=False)

    assert summary == {
        "scanned": 1,
        "recovered": 0,
        "session_updated": 0,
        "run_repaired": 1,
    }
    db.generationsession.update.assert_not_called()
    db.sessionevent.create.assert_not_called()
    db.sessionrun.update.assert_awaited_once_with(
        where={"id": "run-001"},
        data={"status": "completed", "step": "completed"},
    )


@pytest.mark.asyncio
async def test_is_session_already_running_repairs_stale_processing_run_with_output():
    stale_run = SimpleNamespace(
        id="run-001",
        status="processing",
        updatedAt=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    session = SimpleNamespace(
        id="s-001",
        state=GenerationState.SUCCESS.value,
        pptUrl="/api/v1/download",
        wordUrl=None,
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(
            find_first=AsyncMock(return_value=stale_run),
            update=AsyncMock(),
        ),
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(return_value=session),
        ),
    )
    service = TaskRecoveryService(db)

    result = await service.is_session_already_running("s-001")

    assert result is False
    db.sessionrun.update.assert_awaited_once_with(
        where={"id": "run-001"},
        data={"status": "completed", "step": "completed"},
    )
