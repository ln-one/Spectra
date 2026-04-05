import time
from types import SimpleNamespace

import pytest

from services.rag_service import retrieval
from services.rag_service.retrieval import search


class _FakeCollection:
    def __init__(self, project_id="p-001"):
        self.project_id = project_id
        self.queries = []
        self.count_calls = 0

    def count(self):
        self.count_calls += 1
        return 10

    def query(self, **kwargs):
        self.queries.append(kwargs)
        where = kwargs.get("where")
        if where and (
            where.get("session_id") == {"$eq": "s-001"}
            or any(
                condition.get("session_id") == {"$eq": "s-001"}
                for condition in where.get("$and", [])
            )
        ):
            return {
                "ids": [["chunk-session"]],
                "documents": [["session scoped content"]],
                "metadatas": [
                    [
                        {
                            "filename": "session.pdf",
                            "source_type": "document",
                            "page_number": 1,
                            "session_id": "s-001",
                        }
                    ]
                ],
                "distances": [[0.05]],
            }

        if self.project_id == "p-base":
            return {
                "ids": [["chunk-base"]],
                "documents": [["base reference content"]],
                "metadatas": [
                    [
                        {
                            "filename": "base.pdf",
                            "source_type": "document",
                            "page_number": 3,
                        }
                    ]
                ],
                "distances": [[0.01]],
            }

        return {
            "ids": [["chunk-project"]],
            "documents": [["project shared content"]],
            "metadatas": [
                [
                    {
                        "filename": "shared.pdf",
                        "source_type": "document",
                        "page_number": 2,
                    }
                ]
            ],
            "distances": [[0.08]],
        }


class _FakeVector:
    def __init__(self, collections):
        self.collections = collections

    def get_collection_if_exists(self, project_id):
        return self.collections.get(project_id)


class _FakeEmbedding:
    async def embed_text(self, _query):
        return [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_search_keeps_project_shared_chunks_alongside_session_chunks(monkeypatch):
    collection = _FakeCollection()
    service = SimpleNamespace(
        _vector=_FakeVector({"p-001": collection}),
        _embedding=_FakeEmbedding(),
    )

    async def _fake_get_project_references(_project_id):
        return []

    monkeypatch.setattr(
        retrieval.db_service,
        "get_project_references",
        _fake_get_project_references,
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
    collection = _FakeCollection()
    service = SimpleNamespace(
        _vector=_FakeVector({"p-001": collection}),
        _embedding=_FakeEmbedding(),
    )

    async def _fake_get_project_references(_project_id):
        return []

    monkeypatch.setattr(
        retrieval.db_service,
        "get_project_references",
        _fake_get_project_references,
    )

    await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
        session_id="s-001",
        filters={"file_ids": ["file-1"]},
    )

    session_query = collection.queries[0]
    project_query = collection.queries[1]
    assert session_query["where"]["$and"] == [
        {"session_id": {"$eq": "s-001"}},
        {"upload_id": {"$in": ["file-1"]}},
    ]
    assert project_query["where"] == {"upload_id": {"$in": ["file-1"]}}


@pytest.mark.asyncio
async def test_search_includes_base_reference_after_local_content(monkeypatch):
    local_collection = _FakeCollection(project_id="p-001")
    base_collection = _FakeCollection(project_id="p-base")
    service = SimpleNamespace(
        _vector=_FakeVector({"p-001": local_collection, "p-base": base_collection}),
        _embedding=_FakeEmbedding(),
    )

    async def _fake_get_project_references(_project_id):
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
        "get_project_references",
        _fake_get_project_references,
    )

    results = await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
    )

    assert [item.chunk_id for item in results] == ["chunk-project", "chunk-base"]
    assert results[1].metadata["source_project_id"] == "p-base"
    assert results[1].metadata["source_scope"] == "reference_base"
    assert results[1].metadata["reference_relation_type"] == "base"


@pytest.mark.asyncio
async def test_search_reuses_collection_count_for_local_queries(monkeypatch):
    collection = _FakeCollection()
    service = SimpleNamespace(
        _vector=_FakeVector({"p-001": collection}),
        _embedding=_FakeEmbedding(),
    )

    async def _fake_get_project_references(_project_id):
        return []

    monkeypatch.setattr(
        retrieval.db_service,
        "get_project_references",
        _fake_get_project_references,
    )

    await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
        session_id="s-001",
    )

    assert collection.count_calls == 1


@pytest.mark.asyncio
async def test_search_skips_query_rewrite_by_default(monkeypatch):
    collection = _FakeCollection()
    service = SimpleNamespace(
        _vector=_FakeVector({"p-001": collection}),
        _embedding=_FakeEmbedding(),
    )
    rewrite_called = False

    async def _fake_rewrite(_query):
        nonlocal rewrite_called
        rewrite_called = True
        return "rewritten"

    async def _fake_get_project_references(_project_id):
        return []

    monkeypatch.delenv("RAG_ENABLE_QUERY_REWRITE", raising=False)
    monkeypatch.setattr(
        "services.rag_service.query_rewriter.rewrite_query",
        _fake_rewrite,
    )
    monkeypatch.setattr(
        retrieval.db_service,
        "get_project_references",
        _fake_get_project_references,
    )

    await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
    )

    assert rewrite_called is False


@pytest.mark.asyncio
async def test_search_cross_rerank_timeout_falls_back_to_original_order(monkeypatch):
    local_collection = _FakeCollection(project_id="p-001")
    base_collection = _FakeCollection(project_id="p-base")
    service = SimpleNamespace(
        _vector=_FakeVector({"p-001": local_collection, "p-base": base_collection}),
        _embedding=_FakeEmbedding(),
    )

    class _SlowReranker:
        def rerank(self, query, documents, top_k=5):
            del query, documents, top_k
            time.sleep(0.05)
            return [(1, 1.0), (0, 0.8)]

    async def _fake_get_project_references(_project_id):
        return [
            SimpleNamespace(
                targetProjectId="p-base",
                relationType="base",
                mode="follow",
                priority=0,
                pinnedVersionId=None,
            )
        ]

    monkeypatch.setenv("RAG_ENABLE_CROSS_RERANK", "true")
    monkeypatch.setenv("RAG_CROSS_RERANK_TIMEOUT_SECONDS", "0.001")
    monkeypatch.setattr(
        retrieval.db_service,
        "get_project_references",
        _fake_get_project_references,
    )
    monkeypatch.setattr(
        "services.rag_service.reranker.get_reranker",
        lambda: _SlowReranker(),
    )

    results = await search(
        service,
        project_id="p-001",
        query="生成课件",
        top_k=5,
    )

    assert [item.chunk_id for item in results] == ["chunk-project", "chunk-base"]
