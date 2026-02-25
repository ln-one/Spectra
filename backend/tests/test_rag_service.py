"""
RAG Service 测试（使用临时 ChromaDB + mock embedding）
"""

import pytest

from services.rag_service import ParsedChunkData, RAGService
from services.vector_service import VectorService


class MockEmbeddingService:
    """Mock embedding service，返回固定维度向量"""

    def __init__(self, dimension=3):
        self._dim = dimension
        self._call_count = 0

    async def embed_text(self, text: str) -> list[float]:
        """根据文本内容生成确定性向量"""
        self._call_count += 1
        h = hash(text) % 1000
        return [h / 1000.0, (h * 7 % 1000) / 1000.0, (h * 13 % 1000) / 1000.0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed_text(t) for t in texts]

    def get_dimension(self) -> int:
        return self._dim


@pytest.fixture
def mock_emb():
    return MockEmbeddingService()


@pytest.fixture
def vec_svc(tmp_path):
    return VectorService(persist_dir=str(tmp_path / "chroma_test"))


@pytest.fixture
def rag_svc(vec_svc, mock_emb):
    return RAGService(vec_service=vec_svc, emb_service=mock_emb)


class TestIndexChunks:
    """向量化入库测试"""

    @pytest.mark.asyncio
    async def test_index_empty_list(self, rag_svc):
        count = await rag_svc.index_chunks("proj-1", [])
        assert count == 0

    @pytest.mark.asyncio
    async def test_index_and_count(self, rag_svc, vec_svc):
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

        col = vec_svc.get_or_create_collection("proj-idx")
        assert col.count() == 2
# PLACEHOLDER_MORE_TESTS

    @pytest.mark.asyncio
    async def test_upsert_idempotent(self, rag_svc, vec_svc):
        """重复入库同一 chunk 不应报错"""
        chunk = ParsedChunkData(
            chunk_id="c-dup",
            content="重复内容",
            metadata={"source_type": "pdf", "filename": "dup.pdf"},
        )
        await rag_svc.index_chunks("proj-dup", [chunk])
        await rag_svc.index_chunks("proj-dup", [chunk])

        col = vec_svc.get_or_create_collection("proj-dup")
        assert col.count() == 1


class TestSearch:
    """语义检索测试"""

    @pytest.mark.asyncio
    async def test_search_empty_collection(self, rag_svc):
        results = await rag_svc.search("proj-empty", "任意查询")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_returns_results(self, rag_svc):
        chunks = [
            ParsedChunkData(
                chunk_id="s1",
                content="Python 是一种编程语言",
                metadata={
                    "source_type": "document",
                    "filename": "intro.pdf",
                },
            ),
            ParsedChunkData(
                chunk_id="s2",
                content="Java 也是一种编程语言",
                metadata={
                    "source_type": "document",
                    "filename": "intro.pdf",
                },
            ),
        ]
        await rag_svc.index_chunks("proj-search", chunks)
        results = await rag_svc.search("proj-search", "编程语言", top_k=2)
        assert len(results) == 2
        assert all(r.chunk_id in ("s1", "s2") for r in results)
        assert all(r.score > 0 for r in results)

    @pytest.mark.asyncio
    async def test_search_top_k(self, rag_svc):
        chunks = [
            ParsedChunkData(
                chunk_id=f"tk-{i}",
                content=f"内容片段 {i}",
                metadata={"source_type": "pdf", "filename": "f.pdf"},
            )
            for i in range(5)
        ]
        await rag_svc.index_chunks("proj-topk", chunks)
        results = await rag_svc.search("proj-topk", "内容", top_k=2)
        assert len(results) <= 2


class TestGetChunkDetail:
    """分块详情测试"""

    @pytest.mark.asyncio
    async def test_get_existing_chunk(self, rag_svc):
        chunks = [
            ParsedChunkData(
                chunk_id="d1",
                content="详情测试内容",
                metadata={
                    "source_type": "pdf",
                    "filename": "test.pdf",
                    "chunk_index": 0,
                    "upload_id": "u1",
                },
            ),
        ]
        await rag_svc.index_chunks("proj-detail", chunks)
        detail = await rag_svc.get_chunk_detail("d1", project_id="proj-detail")
        assert detail is not None
        assert detail.chunk_id == "d1"
        assert detail.content == "详情测试内容"

    @pytest.mark.asyncio
    async def test_get_nonexistent_chunk(self, rag_svc):
        detail = await rag_svc.get_chunk_detail(
            "nonexistent", project_id="proj-none"
        )
        assert detail is None

    @pytest.mark.asyncio
    async def test_chunk_context(self, rag_svc):
        """测试前后 chunk 上下文"""
        chunks = [
            ParsedChunkData(
                chunk_id=f"ctx-{i}",
                content=f"第 {i} 段内容",
                metadata={
                    "source_type": "pdf",
                    "filename": "ctx.pdf",
                    "chunk_index": i,
                    "upload_id": "u-ctx",
                },
            )
            for i in range(3)
        ]
        await rag_svc.index_chunks("proj-ctx", chunks)
        detail = await rag_svc.get_chunk_detail(
            "ctx-1", project_id="proj-ctx"
        )
        assert detail is not None
        if detail.context:
            assert detail.context.previous_chunk is not None
            assert detail.context.next_chunk is not None


class TestDeleteProjectIndex:
    """删除项目索引测试"""

    @pytest.mark.asyncio
    async def test_delete_existing(self, rag_svc, vec_svc):
        chunks = [
            ParsedChunkData(
                chunk_id="del-1",
                content="待删除",
                metadata={"source_type": "pdf", "filename": "d.pdf"},
            ),
        ]
        await rag_svc.index_chunks("proj-del", chunks)
        assert await rag_svc.delete_project_index("proj-del") is True
