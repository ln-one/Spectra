"""
RAG Service 测试（使用临时 ChromaDB + mock embedding）
"""

import hashlib

import pytest

from services.media.vector import VectorService
from services.rag_service import ParsedChunkData, RAGService


class MockEmbeddingService:
    """Mock embedding service，返回固定维度向量"""

    def __init__(self, dimension=3):
        self._dim = dimension
        self._call_count = 0

    async def embed_text(self, text: str) -> list[float]:
        """根据文本内容生成稳定、低碰撞的确定性向量"""
        self._call_count += 1
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        vector = []
        for i in range(self._dim):
            start = (i * 4) % len(digest)
            chunk = digest[start : start + 4]
            if len(chunk) < 4:
                chunk += digest[: 4 - len(chunk)]
            value = int.from_bytes(chunk, "big") / 0xFFFFFFFF
            vector.append(value)
        return vector

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
    async def test_search_empty_collection(self, rag_svc, vec_svc):
        results = await rag_svc.search("proj-empty", "任意查询")
        assert results == []
        assert vec_svc.get_collection_if_exists("proj-empty") is None

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
        detail = await rag_svc.get_chunk_detail("nonexistent", project_id="proj-none")
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
        detail = await rag_svc.get_chunk_detail("ctx-1", project_id="proj-ctx")
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


class TestScoreThreshold:
    """score_threshold 过滤测试（D-5.3）"""

    @pytest.fixture
    async def indexed_svc(self, rag_svc):
        chunks = [
            ParsedChunkData(
                chunk_id=f"thr-{i}",
                content=f"内容片段{i}",
                metadata={"source_type": "pdf", "filename": "test.pdf"},
            )
            for i in range(5)
        ]
        await rag_svc.index_chunks("proj-thr", chunks)
        return rag_svc

    @pytest.mark.asyncio
    async def test_threshold_zero_returns_all(self, indexed_svc):
        results = await indexed_svc.search(
            "proj-thr", "内容", top_k=5, score_threshold=0.0
        )
        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_threshold_one_returns_none(self, indexed_svc):
        """阈值为 1.0 时，除完全匹配外应全部过滤"""
        results = await indexed_svc.search(
            "proj-thr", "完全不相关的查询xyz", top_k=5, score_threshold=1.0
        )
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_threshold_filters_low_scores(self, indexed_svc):
        """高阈值应比低阈值返回更少结果"""
        low = await indexed_svc.search("proj-thr", "内容", top_k=5, score_threshold=0.0)
        high = await indexed_svc.search(
            "proj-thr", "内容", top_k=5, score_threshold=0.9
        )
        assert len(high) <= len(low)

    @pytest.mark.asyncio
    async def test_results_above_threshold(self, indexed_svc):
        """返回的结果 score 均应 >= threshold"""
        threshold = 0.5
        results = await indexed_svc.search(
            "proj-thr", "内容片段", top_k=5, score_threshold=threshold
        )
        for r in results:
            assert r.score >= threshold
