from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.platform.state_transition_guard import GenerationState
from services.task_executor.common import sync_session_terminal_state


@pytest.mark.asyncio
async def test_sync_session_terminal_state_persists_success_state_reason():
    update = AsyncMock()
    create = AsyncMock()
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(update=update),
            sessionevent=SimpleNamespace(create=create),
        )
    )

    await sync_session_terminal_state(
        db_service=db_service,
        task_id="task-1",
        session_id="session-1",
        state=GenerationState.SUCCESS.value,
        state_reason="task_completed",
        output_urls={"pptx": "/download/ppt"},
        payload_extra={"stage_timings_ms": {"content_generate_ms": 100.0}},
    )

    session_update = update.await_args_list[0].kwargs["data"]
    assert session_update["state"] == GenerationState.SUCCESS.value
    assert session_update["stateReason"] == "task_completed"
    event_payload = create.await_args.kwargs["data"]
    assert event_payload["stateReason"] == "task_completed"
    assert '"stage_timings_ms"' in event_payload["payload"]


@pytest.mark.asyncio
async def test_sync_session_terminal_state_persists_failure_state_reason():
    update = AsyncMock()
    create = AsyncMock()
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(update=update),
            sessionevent=SimpleNamespace(create=create),
        )
    )

    await sync_session_terminal_state(
        db_service=db_service,
        task_id="task-2",
        session_id="session-2",
        state=GenerationState.FAILED.value,
        state_reason="task_failed_unknown_error",
        error_message="boom",
        error_code="TASK_EXECUTION_FAILED",
        retryable=True,
    )

    session_update = update.await_args_list[0].kwargs["data"]
    assert session_update["state"] == GenerationState.FAILED.value
    assert session_update["stateReason"] == "task_failed_unknown_error"
    assert session_update["errorRetryable"] is True
