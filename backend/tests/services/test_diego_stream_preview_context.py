from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.diego_runtime_sync.stream import (
    _append_diego_stream_events,
)


@pytest.mark.anyio
async def test_append_diego_stream_events_persists_preview_context(monkeypatch):
    sync_module_path = "services.generation_session_service.diego_runtime_sync"
    append_event_mock = AsyncMock()
    load_preview_content_mock = AsyncMock(return_value={"title": "Demo"})
    save_preview_content_mock = AsyncMock()

    monkeypatch.setattr(f"{sync_module_path}.append_event", append_event_mock)
    monkeypatch.setattr(
        f"{sync_module_path}.load_preview_content",
        load_preview_content_mock,
    )
    monkeypatch.setattr(
        f"{sync_module_path}.save_preview_content",
        save_preview_content_mock,
    )

    next_seq = await _append_diego_stream_events(
        db=object(),
        session_id="sess-1",
        spectra_run_id="run-1",
        diego_run_id="diego-1",
        diego_trace_id="trace-1",
        diego_events=[
            {
                "seq": 1,
                "event": "plan.completed",
                "payload": {
                    "palette": "academic",
                    "style": "sharp",
                    "style_dna_id": "academic-curation",
                    "fonts": {"title": "Cambria", "body": "Calibri"},
                    "theme": {
                        "primary": "1f2a3b",
                        "secondary": "445566",
                        "accent": "778899",
                        "light": "ddeeff",
                        "bg": "ffffff",
                    },
                },
            }
        ],
        last_seq=0,
    )

    assert next_seq == 1
    save_preview_content_mock.assert_awaited_once()
    _, saved_payload = save_preview_content_mock.await_args.args
    context = saved_payload["diego_preview_context"]
    assert context["provider"] == "diego"
    assert context["run_id"] == "run-1"
    assert context["palette"] == "academic"
    assert context["style"] == "sharp"
    assert context["style_dna_id"] == "academic-curation"
    assert context["fonts"]["title"] == "Cambria"
    assert context["fonts"]["body"] == "Calibri"
    assert context["theme"]["primary"] == "1F2A3B"
    assert context["theme"]["bg"] == "FFFFFF"
    assert context["source_event_seq"] == 1
