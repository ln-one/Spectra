from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.command_runtime import (
    _resolve_slide_modify_stable_state,
    handle_regenerate_slide,
)


def test_resolve_slide_modify_stable_state_prefers_success_for_materialized_output():
    session = SimpleNamespace(
        state="FAILED",
        stateReason="worker_interrupted",
        pptUrl="/api/v1/download",
        wordUrl=None,
    )

    state, reason = _resolve_slide_modify_stable_state(session)

    assert state == "SUCCESS"
    assert reason == "task_completed"


@pytest.mark.anyio
async def test_handle_regenerate_slide_keeps_session_in_stable_success_state(
    monkeypatch,
):
    persist = AsyncMock()
    regenerate = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.persist_session_update_and_events",
        persist,
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.regenerate_diego_slide_for_run",
        regenerate,
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.get_latest_session_run",
        AsyncMock(
            return_value=SimpleNamespace(
                id="run-201",
                sessionId="s-001",
                projectId="p-001",
                toolType="ppt_generate",
                runNo=2,
                title="Run 201",
                titleSource="manual",
                status="completed",
                step="completed",
                artifactId="artifact-1",
            )
        ),
    )

    session = SimpleNamespace(
        id="s-001",
        userId="u-001",
        state="FAILED",
        stateReason="worker_interrupted",
        renderVersion=4,
        pptUrl="/api/v1/download",
        wordUrl=None,
    )

    await handle_regenerate_slide(
        db=SimpleNamespace(),
        session=session,
        command={
            "slide_id": "slide-1",
            "slide_index": 1,
            "instruction": "优化当前页",
            "expected_render_version": 4,
        },
        new_state="RENDERING",
        append_event=AsyncMock(),
        conflict_error_cls=RuntimeError,
    )

    persist.assert_awaited_once()
    persisted_data = persist.await_args.kwargs["session_data"]
    assert persisted_data["state"] == "SUCCESS"
    assert persisted_data["stateReason"] == "task_completed"
    assert persisted_data["errorCode"] is None
    assert persisted_data["errorMessage"] is None

    event_types = [item["event_type"] for item in persist.await_args.kwargs["events"]]
    assert "slide.modify.processing" in event_types
    regenerate.assert_awaited_once()


@pytest.mark.anyio
async def test_handle_regenerate_slide_failure_restores_stable_success_state(
    monkeypatch,
):
    persist = AsyncMock()
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.persist_session_update_and_events",
        persist,
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.regenerate_diego_slide_for_run",
        AsyncMock(side_effect=RuntimeError("diego unavailable")),
    )
    monkeypatch.setattr(
        "services.generation_session_service.command_runtime.get_latest_session_run",
        AsyncMock(return_value=SimpleNamespace(id="run-201")),
    )

    session = SimpleNamespace(
        id="s-001",
        userId="u-001",
        state="SUCCESS",
        stateReason="task_completed",
        renderVersion=4,
        pptUrl="/api/v1/download",
        wordUrl=None,
    )

    with pytest.raises(RuntimeError, match="diego unavailable"):
        await handle_regenerate_slide(
            db=SimpleNamespace(),
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "优化当前页",
                "expected_render_version": 4,
            },
            new_state="RENDERING",
            append_event=AsyncMock(),
            conflict_error_cls=RuntimeError,
        )

    assert persist.await_count == 2
    failure_data = persist.await_args_list[1].kwargs["session_data"]
    assert failure_data["state"] == "SUCCESS"
    assert failure_data["stateReason"] == "task_completed"
