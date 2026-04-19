import copy
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


class _FakeDiegoClientEventPreviewOnly:
    async def get_run(self, _run_id: str) -> dict:
        return {
            "status": "COMPILING",
            "pptx_ready": True,
            "events": [
                {
                    "seq": 1,
                    "event": "slide.generated",
                    "payload": {
                        "slide_no": 1,
                        "status": "ok",
                        "html_preview": "<html><body>event-preview</body></html>",
                        "preview_width": 1280,
                        "preview_height": 720,
                        "slide_id": "event-slide-1",
                    },
                }
            ],
        }

    async def get_slide_preview(self, _run_id: str, _slide_no: int) -> dict:
        raise AssertionError("should not fetch preview when event payload already contains html_preview")

    async def download_pptx(self, _run_id: str) -> bytes:
        return b"pptx-bytes"


class _FakeDiegoClientImagePreviewOnly:
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
            "slide_id": "image-only-slide",
            "status": "ready",
            "image_url": "data:image/png;base64,imageonly",
            "width": 1600,
            "height": 900,
        }

    async def download_pptx(self, _run_id: str) -> bytes:
        return b"pptx-bytes"


class _FakeDiegoClientWithMultiRevision:
    def __init__(self) -> None:
        self._poll_count = 0
        self._preview_count = 0

    async def get_run(self, _run_id: str) -> dict:
        self._poll_count += 1
        if self._poll_count == 1:
            return {
                "status": "SLIDES_GENERATING",
                "slides": [{"slide_no": 1}],
                "events": [
                    {
                        "seq": 1,
                        "event": "slide.generated",
                        "payload": {"slide_no": 1, "status": "generated"},
                    },
                    {
                        "seq": 2,
                        "event": "slide.generated",
                        "payload": {"slide_no": 1, "status": "generated"},
                    },
                ],
            }
        return {
            "status": "SUCCEEDED",
            "slides": [{"slide_no": 1}],
            "events": [
                {
                    "seq": 1,
                    "event": "slide.generated",
                    "payload": {"slide_no": 1, "status": "generated"},
                },
                {
                    "seq": 2,
                    "event": "slide.generated",
                    "payload": {"slide_no": 1, "status": "generated"},
                },
            ],
        }

    async def get_slide_preview(self, _run_id: str, _slide_no: int) -> dict:
        self._preview_count += 1
        html = (
            "<html><body>slide-1-v1</body></html>"
            if self._preview_count == 1
            else "<html><body>slide-1-final</body></html>"
        )
        return {
            "slide_no": 1,
            "page_index": 0,
            "slide_id": "ignored-by-sync",
            "status": "ready",
            "html_preview": html,
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
    preview_event = next(
        call.kwargs["payload"]
        for call in append_event_mock.await_args_list
        if call.kwargs.get("event_type") == GenerationEventType.PPT_SLIDE_GENERATED.value
    )
    assert preview_event["html_preview"] == "<html><body>slide-1</body></html>"
    assert preview_event["preview_width"] == 1600
    assert preview_event["preview_height"] == 900
    assert preview_event["is_final"] is True


@pytest.mark.anyio
async def test_sync_diego_generation_accepts_image_only_preview(monkeypatch):
    fake_client = _FakeDiegoClientImagePreviewOnly()

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

    preview_payload = save_preview_content_mock.await_args_list[-1].args[1]
    final_page = preview_payload["rendered_preview"]["pages"][0]
    assert final_page["slide_id"] == "image-only-slide"
    assert final_page["image_url"] == "data:image/png;base64,imageonly"
    assert final_page["html_preview"] is None

    preview_event = next(
        call.kwargs["payload"]
        for call in append_event_mock.await_args_list
        if call.kwargs.get("event_type") == GenerationEventType.PPT_SLIDE_GENERATED.value
    )
    assert preview_event["image_url"] == "data:image/png;base64,imageonly"
    assert preview_event["image_preview_ready"] is True
    assert preview_event["html_preview_ready"] is False


@pytest.mark.anyio
async def test_sync_diego_generation_refreshes_slide_until_latest_preview(monkeypatch):
    fake_client = _FakeDiegoClientWithMultiRevision()

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
    captured_preview_payloads: list[dict] = []
    sync_module_path = "services.generation_session_service.diego_runtime_sync"

    async def _capture_preview_payload(_run_id: str, payload: dict) -> None:
        captured_preview_payloads.append(copy.deepcopy(payload))

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
        _capture_preview_payload,
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

    assert len(captured_preview_payloads) >= 2
    final_page = captured_preview_payloads[-1]["rendered_preview"]["pages"][0]
    assert "slide-1-final" in str(final_page.get("html_preview") or "")


@pytest.mark.anyio
async def test_sync_diego_generation_prefers_event_html_preview_and_finishes_when_pptx_ready(monkeypatch):
    fake_client = _FakeDiegoClientEventPreviewOnly()

    session = SimpleNamespace(
        id="sess-1",
        projectId="proj-1",
        userId="user-1",
        baseVersionId=None,
        options="{}",
    )
    sessionrun_update = AsyncMock()
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session)),
        outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None)),
        project=SimpleNamespace(
            find_unique=AsyncMock(return_value=SimpleNamespace(name="Demo"))
        ),
        sessionrun=SimpleNamespace(update=sessionrun_update),
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

    preview_payload = save_preview_content_mock.await_args_list[-1].args[1]
    final_page = preview_payload["rendered_preview"]["pages"][0]
    assert final_page["slide_id"] == "event-slide-1"
    assert final_page["html_preview"] == "<html><body>event-preview</body></html>"
    assert persist_artifact_mock.await_count == 1
    assert sessionrun_update.await_count >= 1
