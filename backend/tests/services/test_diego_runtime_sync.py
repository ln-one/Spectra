from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.diego_runtime_sync import (
    sync_diego_generation_until_terminal,
)
from services.platform.generation_event_constants import GenerationEventType


class _FakeDiegoClient:
    def __init__(self) -> None:
        self._poll_count = 0

    async def get_run(self, _run_id: str) -> dict:
        self._poll_count += 1
        if self._poll_count == 1:
            return {
                "status": "SLIDES_GENERATING",
                "events": [
                    {
                        "seq": 1,
                        "event": "slide.generated",
                        "payload": {"slide_no": 1, "status": "ok"},
                    }
                ],
            }
        return {
            "status": "SUCCEEDED",
            "events": [
                {
                    "seq": 1,
                    "event": "slide.generated",
                    "payload": {"slide_no": 1, "status": "ok"},
                }
            ],
        }

    async def get_slide_preview(self, _run_id: str, _slide_no: int) -> dict:
        return {
            "slide_no": 1,
            "page_index": 0,
            "slide_id": "ignored-by-sync",
            "status": "ready",
            "html_preview": "<html><body>slide-1</body></html>",
            "width": 1600,
            "height": 900,
        }

    async def download_pptx(self, _run_id: str) -> bytes:
        return b"pptx-bytes"


@pytest.mark.anyio
async def test_sync_diego_generation_streams_slide_preview(monkeypatch):
    fake_client = _FakeDiegoClient()

    session = SimpleNamespace(
        id="sess-1",
        projectId="proj-1",
        userId="user-1",
        baseVersionId=None,
        options="{}",
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        project=SimpleNamespace(
            find_unique=AsyncMock(return_value=SimpleNamespace(name="Demo"))
        ),
    )
    run = SimpleNamespace(
        id="run-1",
        runNo=1,
        title="Demo Run",
        toolType="courseware_ppt",
    )

    append_event_mock = AsyncMock()
    set_session_state_mock = AsyncMock()
    persist_artifact_mock = AsyncMock(return_value=("artifact-1", "/download/pptx"))
    save_preview_content_mock = AsyncMock()
    sync_module_path = "services.generation_session_service.diego_runtime_sync"

    monkeypatch.setattr(
        f"{sync_module_path}.build_diego_client",
        lambda: fake_client,
    )
    monkeypatch.setattr(
        f"{sync_module_path}.append_event",
        append_event_mock,
    )
    monkeypatch.setattr(
        f"{sync_module_path}.set_session_state",
        set_session_state_mock,
    )
    monkeypatch.setattr(
        f"{sync_module_path}.persist_diego_success_artifact",
        persist_artifact_mock,
    )
    monkeypatch.setattr(
        f"{sync_module_path}.save_preview_content",
        save_preview_content_mock,
    )
    monkeypatch.setattr(
        f"{sync_module_path}.load_preview_content",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        f"{sync_module_path}.asyncio.sleep",
        AsyncMock(return_value=None),
    )

    await sync_diego_generation_until_terminal(
        db=db,
        session_id="sess-1",
        run=run,
        diego_run_id="diego-1",
        diego_trace_id="trace-1",
        poll_interval_seconds=0.01,
        timeout_seconds=2,
    )

    assert save_preview_content_mock.await_count >= 1
    preview_payload = save_preview_content_mock.await_args_list[-1].args[1]
    assert preview_payload["rendered_preview"]["page_count"] == 1
    assert (
        preview_payload["rendered_preview"]["pages"][0]["slide_id"] == "ignored-by-sync"
    )

    event_types = [
        call.kwargs.get("event_type") for call in append_event_mock.await_args_list
    ]
    assert GenerationEventType.PPT_SLIDE_GENERATED.value in event_types
    assert GenerationEventType.GENERATION_COMPLETED.value in event_types
