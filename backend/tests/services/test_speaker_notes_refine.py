from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service.tool_refine_builder.speaker_notes import (
    refine_speaker_notes_content,
)


@pytest.mark.asyncio
async def test_refine_speaker_notes_content_updates_selected_paragraph_anchor():
    current_content = {
        "kind": "speaker_notes",
        "title": "牛顿第二定律说课稿",
        "slides": [
            {
                "id": "slide-1",
                "page": 1,
                "title": "开场引入",
                "sections": [
                    {
                        "id": "slide-1-section-1",
                        "title": "讲稿正文",
                        "paragraphs": [
                            {
                                "id": "slide-1-paragraph-1",
                                "anchor_id": "speaker_notes:v2:slide-1:paragraph-1",
                                "text": "旧讲稿",
                                "role": "script",
                            }
                        ],
                    }
                ],
            }
        ],
        "anchors": [
            {
                "scope": "paragraph",
                "anchor_id": "speaker_notes:v2:slide-1:paragraph-1",
                "slide_id": "slide-1",
                "paragraph_id": "slide-1-paragraph-1",
                "label": "第 1 页讲稿正文",
            }
        ],
    }

    with patch(
        "services.generation_session_service.tool_refine_builder.speaker_notes._load_rag_snippets",
        AsyncMock(return_value=["强调受力分析和加速度的关系"]),
    ):
        updated = await refine_speaker_notes_content(
            current_content=current_content,
            message="新讲稿",
            config={
                "selection_anchor": {
                    "scope": "paragraph",
                    "anchor_id": "speaker_notes:v2:slide-1:paragraph-1",
                }
            },
            project_id="p-001",
            rag_source_ids=["file-1"],
        )

    paragraph = updated["slides"][0]["sections"][0]["paragraphs"][0]
    assert paragraph["text"].startswith("新讲稿")
    assert "讲解提示" in paragraph["text"]
    assert updated["summary"] == "已更新第 1 页讲稿正文。"
