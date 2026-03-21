import logging
from types import SimpleNamespace

import pytest

from services.ai.rag_context import retrieve_rag_context


@pytest.mark.asyncio
async def test_retrieve_rag_context_returns_serialized_results(monkeypatch):
    class _Result:
        def model_dump(self):
            return {"chunk_id": "c-1", "content": "chunk"}

    async def _fake_search(**kwargs):
        return [_Result()]

    monkeypatch.setattr(
        "services.rag_service.rag_service.search",
        _fake_search,
    )

    result = await retrieve_rag_context(
        service=SimpleNamespace(),
        project_id="project-001",
        query="query",
        session_id="session-001",
    )

    assert result == [{"chunk_id": "c-1", "content": "chunk"}]


@pytest.mark.asyncio
async def test_retrieve_rag_context_logs_structured_failure(caplog, monkeypatch):
    async def _fake_search(**kwargs):
        raise RuntimeError("DASHSCOPE_API_KEY not set")

    monkeypatch.setattr(
        "services.rag_service.rag_service.search",
        _fake_search,
    )

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
    assert record.rag_failure_type == "provider_config"
    assert record.filters_present is True
