"""
RAG Service tests backed by the Stratumind client contract.
"""

import pytest

from services.rag_service import ParsedChunkData, RAGService


class _StubClient:
    def __init__(self):
        self.indexed: dict[str, dict[str, dict]] = {}
        self.index_calls: list[int] = []

    async def index_chunks(self, *, project_id: str, chunks: list[dict]):
        self.index_calls.append(len(chunks))
        project_chunks = self.indexed.setdefault(project_id, {})
        for chunk in chunks:
            project_chunks[chunk["chunk_id"]] = chunk
        return {"indexed_count": len(chunks)}

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
        del query
        del planning
        del response
        filters = filters or {}
        project_chunks = list(self.indexed.get(project_id, {}).values())
        results = []
        for chunk in project_chunks:
            metadata = dict(chunk.get("metadata") or {})
            if session_id and metadata.get("session_id") != session_id:
                continue
            if (
                filters.get("file_ids")
                and metadata.get("upload_id") not in filters["file_ids"]
            ):
                continue
            if (
                filters.get("file_types")
                and metadata.get("source_type") not in filters["file_types"]
            ):
                continue
            results.append(
                {
                    "chunk_id": chunk["chunk_id"],
                    "content": chunk["content"],
                    "score": 0.9,
                    "project_id": project_id,
                    "source_scope": "local_session" if session_id else "local_project",
                    "source_type": metadata.get("source_type", "document"),
                    "filename": metadata.get("filename", ""),
                    "file_id": metadata.get("upload_id"),
                    "page_number": metadata.get("page_number"),
                    "session_id": metadata.get("session_id"),
                    "metadata": metadata,
                }
            )
        return {"results": results[:top_k], "total": min(len(results), top_k)}

    async def get_source_detail(self, *, project_id: str, chunk_id: str):
        project_chunks = self.indexed.get(project_id, {})
        chunk = project_chunks.get(chunk_id)
        if chunk is None:
            return None
        metadata = dict(chunk.get("metadata") or {})
        return {
            "chunk_id": chunk_id,
            "content": chunk["content"],
            "source_type": metadata.get("source_type", "document"),
            "filename": metadata.get("filename", ""),
            "page_number": metadata.get("page_number"),
            "context": {
                "previous_chunk": "prev" if metadata.get("chunk_index", 0) > 0 else "",
                "next_chunk": "next",
            },
        }

    async def delete_project_index(self, *, project_id: str):
        self.indexed.pop(project_id, None)
        return {"deleted": True}

    async def delete_upload_index(self, *, project_id: str, upload_id: str):
        project_chunks = self.indexed.get(project_id, {})
        to_delete = [
            chunk_id
            for chunk_id, chunk in project_chunks.items()
            if (chunk.get("metadata") or {}).get("upload_id") == upload_id
        ]
        for chunk_id in to_delete:
            project_chunks.pop(chunk_id, None)
        return {"deleted": True}


@pytest.fixture
def rag_svc():
    service = RAGService()
    service._client = _StubClient()
    return service


class TestIndexChunks:
    @pytest.mark.asyncio
    async def test_index_empty_list(self, rag_svc):
        count = await rag_svc.index_chunks("proj-1", [])
        assert count == 0

    @pytest.mark.asyncio
    async def test_index_and_count(self, rag_svc):
        chunks = [
            ParsedChunkData(
                chunk_id="c1",
                content="光合作用是植物利用光能的过程",
                metadata={"source_type": "pdf", "filename": "bio.pdf"},
            ),
            ParsedChunkData(
                chunk_id="c2",
                content="牛顿第三定律描述了作用力与反作用力",
                metadata={"source_type": "pdf", "filename": "physics.pdf"},
            ),
        ]
        count = await rag_svc.index_chunks("proj-idx", chunks)
        assert count == 2
        assert len(rag_svc._client.indexed["proj-idx"]) == 2

    @pytest.mark.asyncio
    async def test_index_chunks_batches_large_requests(self, rag_svc, monkeypatch):
        monkeypatch.setenv("STRATUMIND_INDEX_BATCH_SIZE", "64")
        chunks = [
            ParsedChunkData(
                chunk_id=f"c{i}",
                content=f"content {i}",
                metadata={"source_type": "pdf", "filename": "large.pdf"},
            )
            for i in range(65)
        ]

        count = await rag_svc.index_chunks("proj-batch", chunks)

        assert count == 65
        assert rag_svc._client.index_calls == [64, 1]


class TestSearch:
    @pytest.mark.asyncio
    async def test_search_empty_collection(self, rag_svc):
        results = await rag_svc.search("proj-empty", "任意查询")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_returns_results(self, rag_svc):
        await rag_svc.index_chunks(
            "proj-search",
            [
                ParsedChunkData(
                    chunk_id="s1",
                    content="Python 是一种编程语言",
                    metadata={"source_type": "document", "filename": "intro.pdf"},
                ),
                ParsedChunkData(
                    chunk_id="s2",
                    content="Java 也是一种编程语言",
                    metadata={"source_type": "document", "filename": "intro.pdf"},
                ),
            ],
        )
        results = await rag_svc.search("proj-search", "编程语言", top_k=2)
        assert len(results) == 2
        assert {r.chunk_id for r in results} == {"s1", "s2"}

    @pytest.mark.asyncio
    async def test_search_filters_by_session_and_file(self, rag_svc):
        await rag_svc.index_chunks(
            "proj-session",
            [
                ParsedChunkData(
                    chunk_id="s1",
                    content="session content",
                    metadata={
                        "source_type": "pdf",
                        "filename": "a.pdf",
                        "session_id": "sess-1",
                        "upload_id": "file-1",
                    },
                ),
                ParsedChunkData(
                    chunk_id="s2",
                    content="project content",
                    metadata={
                        "source_type": "pdf",
                        "filename": "b.pdf",
                        "session_id": "sess-2",
                        "upload_id": "file-2",
                    },
                ),
            ],
        )
        results = await rag_svc.search(
            "proj-session",
            "content",
            top_k=5,
            session_id="sess-1",
            filters={"file_ids": ["file-1"]},
        )
        assert [r.chunk_id for r in results] == ["s1"]


class TestGetChunkDetail:
    @pytest.mark.asyncio
    async def test_get_existing_chunk(self, rag_svc):
        await rag_svc.index_chunks(
            "proj-detail",
            [
                ParsedChunkData(
                    chunk_id="d1",
                    content="详情测试内容",
                    metadata={
                        "source_type": "pdf",
                        "filename": "test.pdf",
                        "chunk_index": 1,
                        "upload_id": "u1",
                    },
                ),
            ],
        )
        detail = await rag_svc.get_chunk_detail("d1", project_id="proj-detail")
        assert detail is not None
        assert detail.chunk_id == "d1"
        assert detail.source.filename == "test.pdf"
        assert detail.context is not None

    @pytest.mark.asyncio
    async def test_get_nonexistent_chunk(self, rag_svc):
        detail = await rag_svc.get_chunk_detail("nonexistent", project_id="proj-none")
        assert detail is None


class TestDeleteIndex:
    @pytest.mark.asyncio
    async def test_delete_existing(self, rag_svc):
        await rag_svc.index_chunks(
            "proj-del",
            [
                ParsedChunkData(
                    chunk_id="del-1",
                    content="待删除",
                    metadata={"source_type": "pdf", "filename": "d.pdf"},
                ),
            ],
        )
        assert await rag_svc.delete_project_index("proj-del") is True
        assert rag_svc._client.indexed.get("proj-del") is None


class TestScoreThreshold:
    @pytest.fixture
    async def indexed_svc(self, rag_svc):
        await rag_svc.index_chunks(
            "proj-thr",
            [
                ParsedChunkData(
                    chunk_id=f"thr-{i}",
                    content=f"内容片段{i}",
                    metadata={"source_type": "pdf", "filename": "test.pdf"},
                )
                for i in range(5)
            ],
        )
        return rag_svc

    @pytest.mark.asyncio
    async def test_threshold_zero_returns_all(self, indexed_svc):
        results = await indexed_svc.search(
            "proj-thr", "内容", top_k=5, score_threshold=0.0
        )
        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_threshold_filters_low_scores(self, indexed_svc):
        results = await indexed_svc.search(
            "proj-thr", "内容", top_k=5, score_threshold=0.95
        )
        assert results == []
