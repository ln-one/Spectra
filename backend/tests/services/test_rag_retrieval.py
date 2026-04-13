from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.rag_service.retrieval import search
from services.stratumind_client import StratumindClientError


class _StubClient:
    def __init__(self):
        self.calls = []

    async def search_text(
        self,
        *,
        project_id: str,
        query: str,
        top_k: int = 5,
        session_id: str | None = None,
        filters: dict | None = None,
        planning: dict | None = None,
        response: dict | None = None,
    ):
        self.calls.append(
            {
                "project_id": project_id,
                "query": query,
                "top_k": top_k,
                "session_id": session_id,
                "filters": filters,
                "planning": planning,
                "response": response,
            }
        )
        if project_id == "p-missing":
            raise StratumindClientError(
                message="missing",
                code="PROJECT_NOT_INDEXED",
                status_code=404,
            )
        if project_id == "p-base":
            return {
                "results": [
                    {
                        "chunk_id": "chunk-base",
                        "content": "base reference content",
                        "score": 0.81,
                        "filename": "base.pdf",
                        "source_type": "document",
                        "metadata": {},
                    }
                ],
                "telemetry": {
                    "selected_profile_name": "balanced_default",
                    "query_buckets": ["reference"],
                },
            }
        if session_id == "s-001":
            return {
                "results": [
                    {
                        "chunk_id": "chunk-session",
                        "content": "session scoped content",
                        "score": 0.95,
                        "filename": "session.pdf",
                        "source_type": "document",
                        "metadata": {},
                    }
                ],
                "telemetry": {
                    "selected_profile_name": "balanced_default",
                    "query_buckets": ["chinese", "local_session"],
                },
                "planning_trace": {
                    "confidence": "high",
                    "matched_buckets": ["chinese"],
                },
                "rewrite": {"applied_rules": ["definition_enrichment"]},
                "evidence": {"mode": "balanced"},
            }
        return {
            "results": [
                {
                    "chunk_id": "chunk-project",
                    "content": "project shared content",
                    "score": 0.9,
                    "filename": "shared.pdf",
                    "source_type": "document",
                    "metadata": {},
                }
            ],
            "telemetry": {
                "selected_profile_name": "balanced_default",
                "query_buckets": ["chinese", "local_project"],
            },
            "planning_trace": {"confidence": "medium", "matched_buckets": ["chinese"]},
            "rewrite": {"applied_rules": ["definition_enrichment"]},
            "evidence": {"mode": "balanced"},
        }


@pytest.mark.asyncio
async def test_search_keeps_project_shared_chunks_alongside_session_chunks(monkeypatch):
    service = SimpleNamespace(_client=_StubClient())
    monkeypatch.setattr(
        "services.rag_service.retrieval.list_active_reference_targets",
        AsyncMock(return_value=[]),
    )

    results = await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
        session_id="s-001",
    )

    assert [item.chunk_id for item in results] == ["chunk-session", "chunk-project"]
    assert results[0].metadata["stratumind_diagnostics"]["matched_buckets"] == [
        "chinese"
    ]
    assert (
        results[0].metadata["stratumind_diagnostics"]["planning_confidence"] == "high"
    )


@pytest.mark.asyncio
async def test_search_combines_selected_file_filter_with_session_overlay(monkeypatch):
    client = _StubClient()
    service = SimpleNamespace(_client=client)
    monkeypatch.setattr(
        "services.rag_service.retrieval.list_active_reference_targets",
        AsyncMock(return_value=[]),
    )

    await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
        session_id="s-001",
        filters={"file_ids": ["file-1"]},
    )

    assert client.calls[0]["project_id"] == "p-001"
    assert client.calls[0]["session_id"] == "s-001"
    assert client.calls[0]["filters"] == {"file_ids": ["file-1"]}
    assert client.calls[0]["planning"] == {
        "allowed_scopes": ["local_session"],
        "preferred_scopes": ["local_session"],
    }
    assert client.calls[0]["response"] == {
        "include_evidence": True,
        "include_planning_trace": True,
        "include_rewrite_trace": True,
    }
    assert client.calls[1]["project_id"] == "p-001"
    assert client.calls[1]["session_id"] is None
    assert client.calls[1]["filters"] == {"file_ids": ["file-1"]}
    assert client.calls[1]["planning"] == {
        "allowed_scopes": ["local_project"],
        "preferred_scopes": ["local_project"],
    }


@pytest.mark.asyncio
async def test_search_includes_base_reference_after_local_content(monkeypatch):
    service = SimpleNamespace(_client=_StubClient())
    monkeypatch.setattr(
        "services.rag_service.retrieval.list_active_reference_targets",
        AsyncMock(
            return_value=[
                {
                    "source_project_id": "p-base",
                    "source_scope": "reference_base",
                    "relation_type": "base",
                    "reference_mode": "follow",
                    "reference_priority": 0,
                    "pinned_version_id": None,
                }
            ]
        ),
    )

    results = await search(service, project_id="p-001", query="生成课件", top_k=5)

    assert [item.chunk_id for item in results] == ["chunk-project", "chunk-base"]
    assert results[1].metadata["source_project_id"] == "p-base"
    assert results[1].metadata["source_scope"] == "reference_base"


@pytest.mark.asyncio
async def test_search_skips_missing_reference_indexes(monkeypatch):
    client = _StubClient()
    service = SimpleNamespace(_client=client)

    monkeypatch.setattr(
        "services.rag_service.retrieval.list_active_reference_targets",
        AsyncMock(
            return_value=[
                {
                    "source_project_id": "p-missing",
                    "source_scope": "reference_auxiliary",
                    "relation_type": "auxiliary",
                    "reference_mode": "follow",
                    "reference_priority": 1,
                    "pinned_version_id": None,
                }
            ]
        ),
    )

    results = await search(service, project_id="p-001", query="生成课件", top_k=5)
    assert [item.chunk_id for item in results] == ["chunk-project"]
