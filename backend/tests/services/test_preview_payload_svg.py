import pytest

from services.generation_session_service.diego_runtime_sync.preview_payload import (
    _load_or_init_run_preview_payload,
    _upsert_rendered_preview_page,
)


@pytest.mark.asyncio
async def test_upsert_rendered_preview_page_promotes_svg_format():
    payload = {
        "title": "课件预览",
        "markdown_content": "",
        "lesson_plan_markdown": "",
        "rendered_preview": {
            "format": "html",
            "pages": [],
            "page_count": 0,
        },
    }

    changed = _upsert_rendered_preview_page(
        payload,
        {
            "index": 0,
            "slide_id": "slide-0",
            "format": "svg",
            "svg_data_url": "data:image/svg+xml;base64,AAA",
        },
    )

    assert changed is True
    assert payload["rendered_preview"]["format"] == "svg"


@pytest.mark.asyncio
async def test_load_or_init_run_preview_payload_promotes_existing_svg_pages():
    class _SessionModel:
        async def find_unique(self, **kwargs):
            return None

    class _ProjectModel:
        async def find_unique(self, **kwargs):
            return None

    class _Db:
        generationsession = _SessionModel()
        project = _ProjectModel()
        outlineversion = None

    async def _load_preview_content(_spectra_run_id: str):
        return {
            "title": "课件预览",
            "markdown_content": "",
            "lesson_plan_markdown": "",
            "rendered_preview": {
                "format": "html",
                "pages": [
                    {
                        "index": 0,
                        "slide_id": "slide-0",
                        "format": "svg",
                        "svg_data_url": "data:image/svg+xml;base64,AAA",
                    }
                ],
                "page_count": 1,
            },
        }

    from services.generation_session_service.diego_runtime_sync import preview_payload

    original_active = preview_payload.active
    preview_payload.active = lambda name: _load_preview_content
    try:
        payload = await _load_or_init_run_preview_payload(
            db=_Db(),
            session_id="session-1",
            spectra_run_id="run-1",
        )
    finally:
        preview_payload.active = original_active

    assert payload["rendered_preview"]["format"] == "svg"
