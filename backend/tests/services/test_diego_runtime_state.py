from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.diego_runtime_state import set_session_state


@pytest.mark.anyio
async def test_set_session_state_omits_progress_when_none(monkeypatch):
    db = SimpleNamespace(generationsession=SimpleNamespace(update=AsyncMock()))
    append_state_changed_event_mock = AsyncMock()
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime_state.append_state_changed_event",
        append_state_changed_event_mock,
    )

    await set_session_state(
        db=db,
        session_id="sess-1",
        state="FAILED",
        state_reason="diego_run_failed",
        progress=None,
        payload={"stage": "diego"},
        error_code="DIEGO_RUN_FAILED",
        error_message="failed",
        error_retryable=True,
    )

    update_data = db.generationsession.update.await_args.kwargs["data"]
    assert "progress" not in update_data
    assert update_data["state"] == "FAILED"
    assert update_data["stateReason"] == "diego_run_failed"
    assert update_data["errorCode"] == "DIEGO_RUN_FAILED"
    assert update_data["errorRetryable"] is True

    append_state_changed_event_mock.assert_awaited_once()
    assert (
        append_state_changed_event_mock.await_args.kwargs["progress"] is None
    )


@pytest.mark.anyio
async def test_set_session_state_writes_progress_when_present(monkeypatch):
    db = SimpleNamespace(generationsession=SimpleNamespace(update=AsyncMock()))
    append_state_changed_event_mock = AsyncMock()
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime_state.append_state_changed_event",
        append_state_changed_event_mock,
    )

    await set_session_state(
        db=db,
        session_id="sess-2",
        state="GENERATING_CONTENT",
        state_reason="outline_confirmed",
        progress=60,
        payload={"stage": "diego_slides_generating"},
    )

    update_data = db.generationsession.update.await_args.kwargs["data"]
    assert update_data["progress"] == 60
    assert update_data["state"] == "GENERATING_CONTENT"

    append_state_changed_event_mock.assert_awaited_once()
    assert append_state_changed_event_mock.await_args.kwargs["progress"] == 60
