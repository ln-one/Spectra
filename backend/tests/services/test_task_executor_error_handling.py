from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_executor.constants import TaskExecutionErrorCode
from services.task_executor.generation_error_handling import handle_retryable_error


@pytest.mark.asyncio
async def test_retryable_timeout_uses_stable_timeout_code():
    db_service = SimpleNamespace(
        update_generation_task_status=AsyncMock(),
        increment_task_retry_count=AsyncMock(),
        db=SimpleNamespace(
            generationsession=SimpleNamespace(update=AsyncMock()),
            sessionevent=SimpleNamespace(create=AsyncMock()),
        ),
    )
    context = SimpleNamespace(
        task_id="task-1",
        project_id="project-1",
        session_id="session-1",
        start_time=0.0,
    )

    await handle_retryable_error(db_service, context, TimeoutError("provider stuck"))

    db_service.update_generation_task_status.assert_awaited_once_with(
        task_id="task-1",
        status="failed",
        error_message="生成任务执行超时",
    )

    session_updates = [
        call.kwargs["data"]
        for call in db_service.db.generationsession.update.await_args_list
        if "errorCode" in (call.kwargs.get("data") or {})
    ]
    assert len(session_updates) == 1
    assert session_updates[0]["errorCode"] == TaskExecutionErrorCode.TIMEOUT.value
    assert session_updates[0]["errorMessage"] == "生成任务执行超时"

    event_payload = db_service.db.sessionevent.create.await_args.kwargs["data"][
        "payload"
    ]
    assert TaskExecutionErrorCode.TIMEOUT.value in event_payload
