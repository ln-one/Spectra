from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service.command_runtime import handle_regenerate_slide
from services.platform.generation_event_constants import GenerationEventType


@pytest.mark.anyio
async def test_handle_regenerate_slide_emits_processing_event():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        generationtask=SimpleNamespace(find_first=AsyncMock(), update=AsyncMock()),
        sessionrun=SimpleNamespace(count=AsyncMock(return_value=0), create=AsyncMock()),
    )
    session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        renderVersion=2,
        options=None,
    )
    append_event = AsyncMock()
    run = SimpleNamespace(
        id="run-001",
        sessionId="s-001",
        projectId="p-001",
        toolType="slide_modify",
        runNo=1,
        title="test-run",
        titleSource="pending",
        titleUpdatedAt=None,
        status="processing",
        step="modify_slide",
        artifactId=None,
        createdAt=None,
        updatedAt=None,
    )
    db.sessionrun.create.return_value = run
    db.generationtask.find_first.return_value = SimpleNamespace(
        id="task-001",
        inputData='{"preview_content":{"title":"t","markdown_content":"# A\\n\\n---\\n\\n# B","lesson_plan_markdown":"lp"}}',
    )

    with (
        patch(
            "services.generation_session_service.command_runtime.load_preview_content",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "services.generation_session_service.command_runtime.save_preview_content",
            new=AsyncMock(),
        ),
        patch(
            "services.ai.ai_service.modify_courseware",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    title="new-title",
                    markdown_content="# A-modified\\n\\n---\\n\\n# B",
                    lesson_plan_markdown="lp-new",
                )
            ),
        ),
    ):
        result = await handle_regenerate_slide(
            db=db,
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "optimize page one",
            },
            new_state="RENDERING",
            append_event=append_event,
            conflict_error_cls=RuntimeError,
        )

    assert result["slide_id"] == "slide-1"
    assert result["preview_updated"] is True
    assert result["source_bound"] is False
    assert result["source_chunk_count"] == 0
    assert result["source_scope"] == "no_source_constraint"
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
        generationtask=SimpleNamespace(find_first=AsyncMock(), update=AsyncMock()),
        sessionrun=SimpleNamespace(count=AsyncMock(return_value=0), create=AsyncMock()),
    )
    session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        renderVersion=2,
        options=None,
    )
    append_event = AsyncMock()

    with pytest.raises(RuntimeError):
        await handle_regenerate_slide(
            db=db,
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "optimize page one",
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


@pytest.mark.anyio
async def test_handle_regenerate_slide_does_not_mutate_session_when_preview_missing():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        generationtask=SimpleNamespace(
            find_first=AsyncMock(return_value=None), update=AsyncMock()
        ),
        sessionrun=SimpleNamespace(count=AsyncMock(return_value=0), create=AsyncMock()),
    )
    session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        renderVersion=2,
        options=None,
    )
    append_event = AsyncMock()

    with pytest.raises(RuntimeError, match="preview content is missing"):
        await handle_regenerate_slide(
            db=db,
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "optimize page one",
            },
            new_state="RENDERING",
            append_event=append_event,
            conflict_error_cls=RuntimeError,
        )

    db.sessionrun.create.assert_not_called()
    db.generationsession.update.assert_not_called()
    event_types = [call.kwargs["event_type"] for call in append_event.await_args_list]
    assert event_types == [GenerationEventType.SLIDE_MODIFY_FAILED.value]


@pytest.mark.anyio
async def test_handle_regenerate_slide_fallbacks_to_project_rag_when_selected_source_misses():
    db = SimpleNamespace(
        generationsession=SimpleNamespace(update=AsyncMock()),
        generationtask=SimpleNamespace(find_first=AsyncMock(), update=AsyncMock()),
        sessionrun=SimpleNamespace(count=AsyncMock(return_value=0), create=AsyncMock()),
    )
    session = SimpleNamespace(
        id="s-001",
        projectId="p-001",
        renderVersion=2,
        options='{"template_config":{"rag_source_ids":["file-1"]}}',
    )
    append_event = AsyncMock()
    run = SimpleNamespace(
        id="run-001",
        sessionId="s-001",
        projectId="p-001",
        toolType="slide_modify",
        runNo=1,
        title="test-run",
        titleSource="pending",
        titleUpdatedAt=None,
        status="processing",
        step="modify_slide",
        artifactId=None,
        createdAt=None,
        updatedAt=None,
    )
    db.sessionrun.create.return_value = run
    db.generationtask.find_first.return_value = SimpleNamespace(
        id="task-001",
        inputData='{"preview_content":{"title":"t","markdown_content":"# A\\n\\n---\\n\\n# B","lesson_plan_markdown":"lp"}}',
    )

    with (
        patch(
            "services.generation_session_service.command_runtime.load_preview_content",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "services.generation_session_service.command_runtime.retrieve_rag_context",
            new=AsyncMock(
                side_effect=[
                    [],
                    [{"content": "project chunk", "source": {"filename": "doc.md"}}],
                ]
            ),
        ) as mock_retrieve,
        patch(
            "services.generation_session_service.command_runtime.save_preview_content",
            new=AsyncMock(),
        ),
        patch(
            "services.ai.ai_service.modify_courseware",
            new=AsyncMock(
                return_value=SimpleNamespace(
                    title="new-title",
                    markdown_content="# A-modified\\n\\n---\\n\\n# B",
                    lesson_plan_markdown="lp-new",
                )
            ),
        ),
    ):
        result = await handle_regenerate_slide(
            db=db,
            session=session,
            command={
                "slide_id": "slide-1",
                "slide_index": 1,
                "instruction": "revise this slide",
            },
            new_state="RENDERING",
            append_event=append_event,
            conflict_error_cls=RuntimeError,
        )

    event_types = [call.kwargs["event_type"] for call in append_event.await_args_list]
    assert event_types == [
        "slide.modify.started",
        GenerationEventType.SLIDE_MODIFY_PROCESSING.value,
        GenerationEventType.SLIDE_UPDATED.value,
    ]
    assert result["source_bound"] is True
    assert result["source_scope"] == "project_kb_fallback"
    assert result["source_chunk_count"] == 1
    assert mock_retrieve.await_count == 2
    assert mock_retrieve.await_args_list[0].kwargs["filters"] == {
        "file_ids": ["file-1"]
    }
    assert mock_retrieve.await_args_list[1].kwargs["filters"] is None
