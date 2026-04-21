from __future__ import annotations

import pytest

from services.generation_session_service.tool_refine_builder import word_document as word_refine
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


@pytest.mark.asyncio
async def test_refine_word_document_direct_edit_with_document_content_skips_rag_and_ai(monkeypatch):
    current_content = {
        "title": "光合作用教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 光合作用教案\n\n旧内容",
    }
    document_content = markdown_to_document_content("# 光合作用教案\n\n## 教学重点\n\n- 理解反应过程")
    rag_called = False
    ai_called = False

    async def fake_load_rag_snippets(**_: object) -> list[str]:
        nonlocal rag_called
        rag_called = True
        return ["snippet"]

    async def fake_generate(**_: object) -> dict[str, str]:
        nonlocal ai_called
        ai_called = True
        return {"content": "# 不该出现"}

    monkeypatch.setattr(word_refine, "_load_rag_snippets", fake_load_rag_snippets)
    monkeypatch.setattr(word_refine.ai_service, "generate", fake_generate)

    updated = await refine_word_document_content(
        current_content=current_content,
        message="更新文档内容",
        config={"document_content": document_content},
        project_id="p-001",
        rag_source_ids=["rag-1"],
    )

    assert "教学重点" in updated["lesson_plan_markdown"]
    assert rag_called is False
    assert ai_called is False


@pytest.mark.asyncio
async def test_refine_word_document_direct_edit_with_lesson_plan_markdown_skips_rag_and_ai(
    monkeypatch,
):
    current_content = {
        "title": "分数加减法教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 分数加减法教案\n\n旧内容",
    }
    rag_called = False
    ai_called = False

    async def fake_load_rag_snippets(**_: object) -> list[str]:
        nonlocal rag_called
        rag_called = True
        return ["snippet"]

    async def fake_generate(**_: object) -> dict[str, str]:
        nonlocal ai_called
        ai_called = True
        return {"content": "# 不该出现"}

    monkeypatch.setattr(word_refine, "_load_rag_snippets", fake_load_rag_snippets)
    monkeypatch.setattr(word_refine.ai_service, "generate", fake_generate)

    updated = await refine_word_document_content(
        current_content=current_content,
        message="更新文档内容",
        config={"lesson_plan_markdown": "# 分数加减法教案\n\n## 课堂练习\n\n- 完成例题"},
        project_id="p-001",
        rag_source_ids=["rag-1"],
    )

    assert "课堂练习" in updated["lesson_plan_markdown"]
    assert "<html" in updated["preview_html"]
    assert rag_called is False
    assert ai_called is False


@pytest.mark.asyncio
async def test_refine_word_document_direct_edit_with_markdown_content_skips_rag_and_ai(
    monkeypatch,
):
    current_content = {
        "title": "化学实验安全教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 化学实验安全教案\n\n旧内容",
    }
    rag_called = False
    ai_called = False

    async def fake_load_rag_snippets(**_: object) -> list[str]:
        nonlocal rag_called
        rag_called = True
        return ["snippet"]

    async def fake_generate(**_: object) -> dict[str, str]:
        nonlocal ai_called
        ai_called = True
        return {"content": "# 不该出现"}

    monkeypatch.setattr(word_refine, "_load_rag_snippets", fake_load_rag_snippets)
    monkeypatch.setattr(word_refine.ai_service, "generate", fake_generate)

    updated = await refine_word_document_content(
        current_content=current_content,
        message="更新文档内容",
        config={"markdown_content": "# 化学实验安全教案\n\n## 风险提示\n\n- 戴护目镜"},
        project_id="p-001",
        rag_source_ids=["rag-1"],
    )

    assert "风险提示" in updated["lesson_plan_markdown"]
    assert rag_called is False
    assert ai_called is False


@pytest.mark.asyncio
async def test_refine_word_document_message_only_keeps_chat_refine_with_rag(monkeypatch):
    current_content = {
        "title": "细胞结构教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": "# 细胞结构教案\n\n## 教学目标\n\n- 认识细胞器",
    }
    seen: dict[str, object] = {}

    async def fake_load_rag_snippets(**kwargs: object) -> list[str]:
        seen["rag_kwargs"] = kwargs
        return ["结构化参考片段"]

    async def fake_generate(**kwargs: object) -> dict[str, str]:
        seen["generate_kwargs"] = kwargs
        return {"content": "# 细胞结构教案\n\n## 教学目标\n\n- 理解细胞器功能"}

    monkeypatch.setattr(word_refine, "_load_rag_snippets", fake_load_rag_snippets)
    monkeypatch.setattr(word_refine.ai_service, "generate", fake_generate)

    updated = await refine_word_document_content(
        current_content=current_content,
        message="把目标写得更清楚",
        config={},
        project_id="p-001",
        rag_source_ids=["rag-1"],
    )

    assert seen["rag_kwargs"] == {
        "project_id": "p-001",
        "query": "把目标写得更清楚",
        "rag_source_ids": ["rag-1"],
    }
    assert isinstance(seen.get("generate_kwargs"), dict)
    assert "理解细胞器功能" in updated["lesson_plan_markdown"]


@pytest.mark.asyncio
async def test_refine_word_document_chat_refine_normalizes_heading_hierarchy(monkeypatch):
    current_content = {
        "title": "细胞结构教案",
        "summary": "旧摘要",
        "lesson_plan_markdown": (
            "# 细胞结构教案\n\n## 教学目标\n\n- 认识细胞器\n\n## 教学过程\n\n- 观察示意图"
        ),
    }

    async def fake_load_rag_snippets(**_: object) -> list[str]:
        return []

    async def fake_generate(**_: object) -> dict[str, str]:
        return {
            "content": (
                "# 细胞结构教案\n\n"
                "# 教学目标\n\n"
                "- 理解细胞器功能\n\n"
                "# 教学过程\n\n"
                "## 活动一\n\n"
                "- 观察结构示意图"
            )
        }

    monkeypatch.setattr(word_refine, "_load_rag_snippets", fake_load_rag_snippets)
    monkeypatch.setattr(word_refine.ai_service, "generate", fake_generate)

    updated = await refine_word_document_content(
        current_content=current_content,
        message="把结构写得更清楚",
        config={},
        project_id="p-001",
        rag_source_ids=None,
    )

    assert updated["lesson_plan_markdown"].startswith("# 细胞结构教案")
    assert "\n## 教学目标\n" in updated["lesson_plan_markdown"]
    assert "\n## 教学过程\n" in updated["lesson_plan_markdown"]
    assert "\n### 活动一\n" in updated["lesson_plan_markdown"]
    assert updated["lesson_plan_markdown"].count("\n# ") == 0
