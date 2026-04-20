import pytest

from services.generation_session_service import (
    tool_content_builder,
    tool_refine_builder,
)


@pytest.mark.asyncio
async def test_tool_content_builder_loads_library_rag_when_source_ids_missing(
    monkeypatch,
):
    captured: dict = {}

    async def _fake_retrieve_rag_context(**kwargs):
        captured.update(kwargs)
        return [{"content": "库内知识片段A"}]

    monkeypatch.setattr(
        tool_content_builder.ai_service,
        "_retrieve_rag_context",
        _fake_retrieve_rag_context,
    )

    snippets = await tool_content_builder._load_rag_snippets(
        project_id="p-001",
        query="牛顿第二定律",
        rag_source_ids=None,
    )

    assert snippets == ["库内知识片段A"]
    assert captured["project_id"] == "p-001"
    assert captured["filters"] is None


@pytest.mark.asyncio
async def test_tool_content_builder_animation_skips_library_rag_when_source_ids_missing(
    monkeypatch,
):
    called = {"value": False}

    async def _fake_retrieve_rag_context(**kwargs):
        called["value"] = True
        return [{"content": "不应加载"}]

    monkeypatch.setattr(
        tool_content_builder.ai_service,
        "_retrieve_rag_context",
        _fake_retrieve_rag_context,
    )

    snippets = await tool_content_builder._load_rag_snippets(
        project_id="p-001",
        query="冒泡排序",
        rag_source_ids=None,
        card_id="demonstration_animations",
    )

    assert snippets == []
    assert called["value"] is False


@pytest.mark.asyncio
async def test_tool_content_builder_animation_filters_ai_generated_rag_sources(
    monkeypatch,
):
    async def _fake_retrieve_rag_context(**kwargs):
        return [
            {
                "content": "Scene 1: 旧链路模板",
                "filename": "ai_generated",
                "metadata": {
                    "source_type": "ai_generated",
                    "source_artifact_tool_type": "demonstration_animations",
                },
            },
            {
                "content": "冒泡排序核心是相邻比较并交换。",
                "filename": "教材摘录.pdf",
                "metadata": {"source_type": "document"},
            },
        ]

    monkeypatch.setattr(
        tool_content_builder.ai_service,
        "_retrieve_rag_context",
        _fake_retrieve_rag_context,
    )

    snippets = await tool_content_builder._load_rag_snippets(
        project_id="p-001",
        query="冒泡排序",
        rag_source_ids=["doc-1"],
        card_id="demonstration_animations",
    )

    assert len(snippets) == 1
    assert "相邻比较并交换" in snippets[0]
    assert "旧链路模板" not in snippets[0]


@pytest.mark.asyncio
async def test_tool_refine_builder_loads_library_rag_when_source_ids_missing(
    monkeypatch,
):
    captured: dict = {}

    async def _fake_retrieve_rag_context(**kwargs):
        captured.update(kwargs)
        return [{"content": "库内知识片段B"}]

    monkeypatch.setattr(
        tool_refine_builder.ai_service,
        "_retrieve_rag_context",
        _fake_retrieve_rag_context,
    )

    snippets = await tool_refine_builder._load_rag_snippets(
        project_id="p-001",
        query="受力分析",
        rag_source_ids=None,
    )

    assert snippets == ["库内知识片段B"]
    assert captured["project_id"] == "p-001"
    assert captured["filters"] is None
