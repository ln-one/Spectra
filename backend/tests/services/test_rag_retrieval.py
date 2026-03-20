from types import SimpleNamespace

import pytest

from services.rag_service.retrieval import search


class _FakeCollection:
    def __init__(self):
        self.queries = []

    def count(self):
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
    def __init__(self, collection):
        self.collection = collection

    def get_collection_if_exists(self, _project_id):
        return self.collection


class _FakeEmbedding:
    async def embed_text(self, _query):
        return [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_search_keeps_project_shared_chunks_alongside_session_chunks():
    collection = _FakeCollection()
    service = SimpleNamespace(
        _vector=_FakeVector(collection),
        _embedding=_FakeEmbedding(),
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
async def test_search_combines_selected_file_filter_with_session_overlay():
    collection = _FakeCollection()
    service = SimpleNamespace(
        _vector=_FakeVector(collection),
        _embedding=_FakeEmbedding(),
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
