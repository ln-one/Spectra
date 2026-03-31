import logging
from types import SimpleNamespace

import pytest

import services.rag_service as rag_module
from services.ai.rag_context import retrieve_rag_context
from services.system_settings_service import system_settings_service


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
async def test_retrieve_rag_context_applies_dedup_and_rule_compression(monkeypatch):
    class _Result:
        def __init__(self, payload):
            self._payload = payload

        def model_dump(self):
            return dict(self._payload)

    async def _fake_search(**kwargs):
        return [
            _Result(
                {
                    "chunk_id": "chunk-low",
                    "content": (
                        "项目需求文档。本文档来自比赛原始需求。"
                        "当前 AI 辅助教学工具存在的问题：功能单一、操作割裂。"
                    ),
                    "score": 0.72,
                    "source": {
                        "chunk_id": "chunk-low",
                        "filename": "需求.pdf",
                        "source_type": "document",
                    },
                    "metadata": {"upload_id": "file-1", "chunk_index": 0},
                }
            ),
            _Result(
                {
                    "chunk_id": "chunk-high",
                    "content": (
                        "当前 AI 辅助教学工具存在的问题：功能单一、操作割裂，"
                        "未形成以教师教学思路为核心的闭环工作流。"
                        "项目价值：减负增效。"
                    ),
                    "score": 0.93,
                    "source": {
                        "chunk_id": "chunk-high",
                        "filename": "需求.pdf",
                        "source_type": "document",
                    },
                    "metadata": {"upload_id": "file-1", "chunk_index": 1},
                }
            ),
        ]

    monkeypatch.setattr(rag_module.rag_service, "search", _fake_search)
    monkeypatch.setenv("ENABLE_CONTEXT_DEDUP", "true")
    monkeypatch.setenv("ENABLE_CONTEXT_COMPRESSION", "true")
    monkeypatch.setenv("RAG_CONTEXT_COMPRESSION_MODE", "rule")
    monkeypatch.setenv("RAG_CONTEXT_MAX_SENTENCES_PER_CHUNK", "1")
    system_settings_service.reset_for_tests()

    result = await retrieve_rag_context(
        service=SimpleNamespace(),
        project_id="project-001",
        query="当前AI辅助教学工具主要存在哪些问题",
        session_id="session-001",
    )

    assert result is not None
    assert len(result) == 1
    assert result[0]["chunk_id"] == "chunk-high"
    assert "功能单一" in result[0]["content"]
    assert "本文档来自比赛原始需求" not in result[0]["content"]
