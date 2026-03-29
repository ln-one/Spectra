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
