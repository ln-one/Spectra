from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.rag_service import retrieval
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
    ):
        self.calls.append((project_id, query, top_k, session_id, filters))
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
                ]
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
                ]
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
            ]
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

    assert client.calls[0] == (
        "p-001",
        "生成课件",
        5,
        "s-001",
        {"file_ids": ["file-1"]},
    )
    assert client.calls[1] == ("p-001", "生成课件", 5, None, {"file_ids": ["file-1"]})


@pytest.mark.asyncio
async def test_search_includes_base_reference_after_local_content(monkeypatch):
    service = SimpleNamespace(_client=_StubClient())

    async def _fake_get_project_references(*, project_id, user_id):
        assert project_id == "p-001"
        assert user_id == "u-1"
        return [
            SimpleNamespace(
                targetProjectId="p-base",
                relationType="base",
                mode="follow",
                priority=0,
                pinnedVersionId=None,
            )
        ]

    monkeypatch.setattr(
        retrieval.db_service,
        "get_project",
        AsyncMock(return_value=SimpleNamespace(userId="u-1")),
    )
    monkeypatch.setattr(
        "services.project_space_service.project_space_service.get_project_references",
        _fake_get_project_references,
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
        retrieval.db_service,
        "get_project",
        AsyncMock(return_value=SimpleNamespace(userId="u-1")),
    )
    monkeypatch.setattr(
        "services.project_space_service.project_space_service.get_project_references",
        AsyncMock(
            return_value=[
                SimpleNamespace(
                    targetProjectId="p-missing",
                    relationType="auxiliary",
                    mode="follow",
                    priority=1,
                    pinnedVersionId=None,
                )
            ]
        ),
    )

    results = await search(service, project_id="p-001", query="生成课件", top_k=5)
    assert [item.chunk_id for item in results] == ["chunk-project"]
