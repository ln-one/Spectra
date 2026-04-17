import logging
from types import SimpleNamespace

import pytest

import services.rag_service as rag_module
from services.ai.rag_context import retrieve_rag_context


@pytest.mark.asyncio
async def test_retrieve_rag_context_returns_serialized_results(monkeypatch):
    class _Result:
        def model_dump(self):
            return {"chunk_id": "c-1", "content": "chunk"}

    async def _fake_search(**kwargs):
        return [_Result()]

    monkeypatch.setattr(rag_module.rag_service, "search", _fake_search)

    result = await retrieve_rag_context(
        service=SimpleNamespace(),
        project_id="project-001",
        query="query",
        session_id="session-001",
    )

    assert result == [{"chunk_id": "c-1", "content": "chunk"}]


@pytest.mark.asyncio
async def test_retrieve_rag_context_prepends_multimodal_visual_hint(monkeypatch):
    class _Result:
        def __init__(self):
            self.content = "这里有图：![demo](images/page-1.png)"
            self.score = 0.91
            self.source = SimpleNamespace(
                chunk_id="c-img",
                source_type="document",
                filename="lesson.pdf",
                page_number=2,
            )

        def model_dump(self):
            return {
                "chunk_id": "c-img",
                "content": self.content,
                "score": self.score,
                "source": {
                    "chunk_id": "c-img",
                    "source_type": "document",
                    "filename": "lesson.pdf",
                    "page_number": 2,
                },
                "metadata": {},
            }

    async def _fake_search(**kwargs):
        return [_Result()]

    async def _fake_build_multimodal_context(service, *, query, rag_results):
        assert query == "这张图讲了什么"
        assert len(rag_results) == 1
        return [
            {
                "chunk_id": "c-img",
                "content": "来源图片可视解析补充：流程图展示了三段式教学步骤。",
                "score": 0.91,
                "source": {
                    "chunk_id": "c-img",
                    "source_type": "document",
                    "filename": "lesson.pdf",
                    "page_number": 2,
                },
                "metadata": {"multimodal_provider": "visual_hint_adapter"},
            }
        ]

    monkeypatch.setattr(rag_module.rag_service, "search", _fake_search)
    monkeypatch.setattr(
        "services.ai.rag_context.build_multimodal_context",
        _fake_build_multimodal_context,
    )

    result = await retrieve_rag_context(
        service=SimpleNamespace(analyze_images_for_chat=object()),
        project_id="project-001",
        query="这张图讲了什么",
        session_id="session-001",
    )

    assert result[0]["metadata"]["multimodal_provider"] == "visual_hint_adapter"
    assert result[1]["chunk_id"] == "c-img"


@pytest.mark.asyncio
async def test_retrieve_rag_context_logs_structured_failure(caplog, monkeypatch):
    async def _fake_search(**kwargs):
        raise RuntimeError("DASHSCOPE_API_KEY not set")

    monkeypatch.setattr(rag_module.rag_service, "search", _fake_search)

    with caplog.at_level(logging.WARNING):
        result = await retrieve_rag_context(
            service=SimpleNamespace(),
            project_id="project-001",
            query="query",
            session_id="session-001",
            filters={"file_ids": ["file-1"]},
        )

    assert result is None
    record = next(
        record
        for record in caplog.records
        if record.msg == "RAG retrieval failed for project %s"
    )
    assert record.project_id == "project-001"
    assert record.session_id == "session-001"
    assert record.rag_failure_type == "config_error"
    assert record.filters_present is True


@pytest.mark.asyncio
async def test_retrieve_rag_context_keeps_text_results_when_multimodal_hint_fails(
    caplog, monkeypatch
):
    class _Result:
        def model_dump(self):
            return {"chunk_id": "c-1", "content": "chunk"}

    async def _fake_search(**kwargs):
        return [_Result()]

    async def _fake_build_multimodal_context(service, *, query, rag_results):
        raise RuntimeError("vision provider unavailable")

    monkeypatch.setattr(rag_module.rag_service, "search", _fake_search)
    monkeypatch.setattr(
        "services.ai.rag_context.build_multimodal_context",
        _fake_build_multimodal_context,
    )

    with caplog.at_level(logging.WARNING):
        result = await retrieve_rag_context(
            service=SimpleNamespace(analyze_images_for_chat=object()),
            project_id="project-001",
            query="这张图讲了什么",
            session_id="session-001",
        )

    assert result == [{"chunk_id": "c-1", "content": "chunk"}]
    record = next(
        record
        for record in caplog.records
        if record.msg == "Multimodal RAG hint skipped for project %s"
    )
    assert record.project_id == "project-001"
    assert record.session_id == "session-001"
