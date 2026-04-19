from __future__ import annotations

import pytest

from services.generation_session_service.tool_refine_builder.word_document import (
    refine_word_document_content,
)
from services.generation_session_service.word_document_content import markdown_to_document_content


@pytest.mark.asyncio
async def test_refine_word_document_content_replaces_document_blocks_and_regenerates_views():
    current_content = {
        "kind": "teaching_document",
        "legacy_kind": "word_document",
        "schema_id": "lesson_plan_v1",
        "title": "牛顿第二定律教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 牛顿第二定律教案\n\n旧内容",
        "preview_html": "<html></html>",
        "doc_source_html": "<html></html>",
        "layout_payload": {},
        "sections": [],
    }

    document_content = markdown_to_document_content("# 牛顿第二定律教案\n\n## 教学目标\n\n- 理解合力与加速度")

    updated = await refine_word_document_content(
        current_content=current_content,
        message="更新文档内容",
        config={
            "document_content": document_content,
            "document_title": "牛顿第二定律教案",
            "document_summary": "已更新为结构化块编辑版本。",
        },
        project_id="p-001",
        rag_source_ids=None,
    )

    assert updated["document_content"]["type"] == "doc"
    assert updated["kind"] == "teaching_document"
    assert updated["legacy_kind"] == "word_document"
    assert updated["schema_id"] == "lesson_plan_v1"
    assert "教学目标" in updated["lesson_plan_markdown"]
    assert "已更新为结构化块编辑版本。" == updated["summary"]
    assert "<html" in updated["preview_html"]
    assert updated["doc_source_html"] == updated["preview_html"]
