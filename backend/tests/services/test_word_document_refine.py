from __future__ import annotations

import pytest

from services.generation_session_service.tool_refine_builder.word_document import (
    _resolve_refine_max_tokens,
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


@pytest.mark.asyncio
async def test_refine_word_document_content_preserves_existing_title_when_request_title_generic():
    current_content = {
        "kind": "teaching_document",
        "legacy_kind": "word_document",
        "schema_id": "lesson_plan_v1",
        "title": "计算机网络物理层教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 计算机网络物理层教案\n\n旧内容",
        "preview_html": "<html></html>",
        "doc_source_html": "<html></html>",
        "layout_payload": {},
        "sections": [],
    }

    document_content = markdown_to_document_content(
        "# 计算机网络物理层教案\n\n## 教学目标\n\n- 理解物理层功能"
    )

    updated = await refine_word_document_content(
        current_content=current_content,
        message="更新文档内容",
        config={
            "document_content": document_content,
            "document_title": "未命名教案",
            "document_summary": "已更新内容。",
        },
        project_id="p-001",
        rag_source_ids=None,
    )

    assert updated["title"] == "计算机网络物理层教案"


@pytest.mark.asyncio
async def test_refine_word_document_content_falls_back_to_source_title_when_current_title_generic():
    current_content = {
        "kind": "teaching_document",
        "legacy_kind": "word_document",
        "schema_id": "lesson_plan_v1",
        "title": "未命名文档",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 教学文档\n\n旧内容",
        "preview_html": "<html></html>",
        "doc_source_html": "<html></html>",
        "source_snapshot": {
            "primary_source_id": "ppt-artifact-1",
            "primary_source_title": "计算机网络：物理层课件",
        },
        "layout_payload": {},
        "sections": [],
    }

    document_content = markdown_to_document_content(
        "## 教学目标\n\n- 理解物理层功能"
    )

    updated = await refine_word_document_content(
        current_content=current_content,
        message="更新文档内容",
        config={
            "document_content": document_content,
            "document_title": "未命名文档",
            "document_summary": "已更新内容。",
        },
        project_id="p-001",
        rag_source_ids=None,
    )

    assert updated["title"] == "计算机网络：物理层教案"


def test_refine_word_max_tokens_never_below_initial_generation_budget(monkeypatch):
    monkeypatch.delenv("STUDIO_WORD_REFINE_MAX_TOKENS", raising=False)
    monkeypatch.setenv("WORD_LESSON_PLAN_MAX_TOKENS", "5400")

    assert _resolve_refine_max_tokens() == 5400

    monkeypatch.setenv("STUDIO_WORD_REFINE_MAX_TOKENS", "3200")
    assert _resolve_refine_max_tokens() == 5400

    monkeypatch.setenv("STUDIO_WORD_REFINE_MAX_TOKENS", "6200")
    assert _resolve_refine_max_tokens() == 6200
