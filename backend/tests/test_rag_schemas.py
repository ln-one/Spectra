"""
RAG Schemas 单元测试

测试 Pydantic 模型的字段验证和序列化。
"""

import pytest
from pydantic import ValidationError

from schemas.rag import (
    ChunkContext,
    RAGFilters,
    RAGResult,
    RAGSearchRequest,
    SourceDetail,
    SourceReference,
)


class TestRAGSearchRequest:
    """RAGSearchRequest 验证测试"""

    def test_valid_request(self):
        req = RAGSearchRequest(project_id="p1", query="光合作用")
        assert req.top_k == 5
        assert req.filters is None

    def test_query_min_length(self):
        with pytest.raises(ValidationError):
            RAGSearchRequest(project_id="p1", query="")

    def test_top_k_range_min(self):
        with pytest.raises(ValidationError):
            RAGSearchRequest(project_id="p1", query="test", top_k=0)

    def test_top_k_range_max(self):
        with pytest.raises(ValidationError):
            RAGSearchRequest(project_id="p1", query="test", top_k=21)

    def test_with_filters(self):
        req = RAGSearchRequest(
            project_id="p1",
            query="test",
            filters=RAGFilters(file_types=["pdf", "word"]),
        )
        assert req.filters.file_types == ["pdf", "word"]
        assert req.filters.file_ids is None


class TestRAGResult:
    """RAGResult 序列化测试"""

    def test_serialization(self):
        result = RAGResult(
            chunk_id="c1",
            content="光合作用是...",
            score=0.95,
            source=SourceReference(
                chunk_id="c1",
                source_type="document",
                filename="bio.pdf",
                page_number=3,
            ),
        )
        data = result.model_dump()
        assert data["chunk_id"] == "c1"
        assert data["score"] == 0.95
        assert data["source"]["filename"] == "bio.pdf"
        assert data["metadata"] is None

    def test_with_metadata(self):
        result = RAGResult(
            chunk_id="c2",
            content="test",
            score=0.8,
            source=SourceReference(
                chunk_id="c2", source_type="video", filename="v.mp4"
            ),
            metadata={"extra": "info"},
        )
        assert result.metadata == {"extra": "info"}


class TestSourceDetail:
    """SourceDetail 测试"""

    def test_with_context(self):
        detail = SourceDetail(
            chunk_id="c1",
            content="主要内容",
            source=SourceReference(
                chunk_id="c1", source_type="document", filename="doc.pdf"
            ),
            context=ChunkContext(
                previous_chunk="前一段", next_chunk="后一段"
            ),
        )
        assert detail.context.previous_chunk == "前一段"

    def test_without_optional_fields(self):
        detail = SourceDetail(
            chunk_id="c1",
            content="内容",
            source=SourceReference(
                chunk_id="c1", source_type="document", filename="f.pdf"
            ),
        )
        assert detail.context is None
        assert detail.file_info is None
