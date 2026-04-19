import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.diego_runtime import (
    confirm_diego_outline_for_session,
)
from utils.exceptions import ExternalServiceException


def _build_session():
    return SimpleNamespace(
        id="sess-1",
        options=json.dumps(
            {
                "diego": {
                    "provider": "diego",
                    "enabled": True,
                    "diego_run_id": "diego-run-1",
                    "diego_trace_id": "trace-1",
                }
            }
        ),
    )


def _build_run():
    return SimpleNamespace(
        id="run-1",
        runNo=1,
        title="run-1",
        toolType="courseware_ppt",
    )


@pytest.mark.anyio
async def test_confirm_outline_failure_does_not_advance_state(monkeypatch):
    db = SimpleNamespace()
    session = _build_session()
    run = _build_run()
    client = SimpleNamespace(
        confirm_outline=AsyncMock(
            side_effect=ExternalServiceException(message="run not found", status_code=502)
        )
    )

    update_session_run_mock = AsyncMock()
    set_session_state_mock = AsyncMock()
    spawn_background_task_mock = AsyncMock()

    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.build_diego_client",
        lambda: client,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.update_session_run",
        update_session_run_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.set_session_state",
        set_session_state_mock,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.spawn_background_task",
        spawn_background_task_mock,
    )

    with pytest.raises(ExternalServiceException):
        await confirm_diego_outline_for_session(
            db=db,
            session=session,
            run=run,
            command={},
        )

    update_session_run_mock.assert_not_awaited()
    set_session_state_mock.assert_not_awaited()
    spawn_background_task_mock.assert_not_called()


@pytest.mark.anyio
async def test_confirm_outline_success_updates_run_before_state(monkeypatch):
    db = SimpleNamespace()
    session = _build_session()
    run = _build_run()
    client = SimpleNamespace(confirm_outline=AsyncMock(return_value={}))
    call_order: list[str] = []

    async def _update_session_run(**kwargs):
        del kwargs
        call_order.append("update_session_run")
        return run

    async def _set_session_state(**kwargs):
        del kwargs
        call_order.append("set_session_state")
        return None

    async def _fake_sync(**kwargs):
        del kwargs
        return None

    def _spawn_background_task(coro, *, label):
        del label
        coro.close()

    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.build_diego_client",
        lambda: client,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.update_session_run",
        _update_session_run,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.set_session_state",
        _set_session_state,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.sync_diego_generation_until_terminal",
        _fake_sync,
    )
    monkeypatch.setattr(
        "services.generation_session_service.diego_runtime.spawn_background_task",
        _spawn_background_task,
    )

    result = await confirm_diego_outline_for_session(
        db=db,
        session=session,
        run=run,
        command={},
    )

    assert result["run"]["run_id"] == "run-1"
    assert call_order == ["update_session_run", "set_session_state"]

