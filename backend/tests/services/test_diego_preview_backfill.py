from types import SimpleNamespace

import pytest

from services.generation_session_service import diego_preview_backfill


SVG_DATA_URL = "data:image/svg+xml;base64,AAA"


@pytest.mark.asyncio
async def test_ensure_svg_authority_preview_returns_existing_svg_without_backfill(
    monkeypatch,
):
    def fail_build_diego_client():
        raise AssertionError("read path must not backfill missing slides once SVG exists")

    monkeypatch.setattr(
        diego_preview_backfill,
        "build_diego_client",
        fail_build_diego_client,
    )

    slides = [
        {"id": "slide-1", "index": 0, "title": "Slide 1"},
        {"id": "slide-2", "index": 1, "title": "Slide 2"},
    ]
    content = {
        "rendered_preview": {
            "format": "svg",
            "page_count": 1,
            "pages": [
                {
                    "index": 0,
                    "slide_id": "slide-1",
                    "format": "svg",
                    "svg_data_url": SVG_DATA_URL,
                    "split_index": 0,
                    "split_count": 1,
                }
            ],
        }
    }

    next_slides, next_content = await diego_preview_backfill.ensure_svg_authority_preview(
        session_id="session-1",
        run_id="run-1",
        material_context={
            "run": SimpleNamespace(id="run-1", toolType="courseware_ppt"),
        },
        slides=slides,
        content=content,
    )

    assert next_content is not content
    assert next_content["rendered_preview"]["page_count"] == 1
    assert next_slides[0]["thumbnail_url"] == SVG_DATA_URL
    assert next_slides[0]["rendered_previews"][0]["svg_data_url"] == SVG_DATA_URL
    assert "rendered_previews" not in next_slides[1]
