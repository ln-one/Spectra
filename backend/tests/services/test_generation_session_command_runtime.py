from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.command_runtime import handle_regenerate_slide
from services.platform.generation_event_constants import GenerationEventType


@pytest.mark.anyio
async def test_handle_regenerate_slide_emits_processing_event():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        sessionrun=SimpleNamespace(count=AsyncMock(return_value=0), create=AsyncMock()),
    )
    session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        renderVersion=2,
    )
    append_event = AsyncMock()
    run = SimpleNamespace(
        id="run-001",
        sessionId="s-001",
        projectId="p-001",
        toolType="slide_modify",
        runNo=1,
        title="第1次单页修改",
        titleSource="pending",
        titleUpdatedAt=None,
        status="processing",
        step="modify_slide",
        artifactId=None,
        createdAt=None,
        updatedAt=None,
    )
    db.sessionrun.create.return_value = run

    result = await handle_regenerate_slide(
        db=db,
        session=session,
        command={
            "slide_id": "slide-1",
            "slide_index": 1,
            "instruction": "优化这一页标题和排版",
        },
        new_state="RENDERING",
        append_event=append_event,
        conflict_error_cls=RuntimeError,
    )

    assert result["slide_id"] == "slide-1"
    event_types = [call.kwargs["event_type"] for call in append_event.await_args_list]
    assert event_types == [
        "slide.modify.started",
        GenerationEventType.SLIDE_MODIFY_PROCESSING.value,
        GenerationEventType.SLIDE_UPDATED.value,
    ]


@pytest.mark.anyio
async def test_handle_regenerate_slide_emits_failed_event_on_conflict():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        sessionrun=SimpleNamespace(count=AsyncMock(return_value=0), create=AsyncMock()),
    )
    session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        renderVersion=2,
    )
    append_event = AsyncMock()

    with pytest.raises(RuntimeError):
        await handle_regenerate_slide(
            db=db,
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "优化这一页标题和排版",
                "expected_render_version": 3,
            },
            new_state="RENDERING",
            append_event=append_event,
            conflict_error_cls=RuntimeError,
        )

    event_types = [call.kwargs["event_type"] for call in append_event.await_args_list]
    assert event_types == [GenerationEventType.SLIDE_MODIFY_FAILED.value]
    payload = append_event.await_args_list[0].kwargs["payload"]
    assert payload["slide_id"] == "slide-1"
    assert payload["failure_type"] == "RuntimeError"
