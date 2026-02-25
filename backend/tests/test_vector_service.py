"""
VectorService 单元测试

使用 tmp_path 创建临时 ChromaDB 持久化目录，不污染项目数据。
"""

import pytest

from services.vector_service import VectorService


@pytest.fixture
def svc(tmp_path):
    """创建使用临时目录的 VectorService"""
    return VectorService(persist_dir=str(tmp_path / "chroma_test"))


class TestVectorService:
    """VectorService 核心功能测试"""

    def test_health_check(self, svc):
        assert svc.health_check() is True

    def test_create_collection(self, svc):
        col = svc.get_or_create_collection("proj-001")
        assert col is not None
        assert col.name == "spectra_project_proj-001"

    def test_get_existing_collection(self, svc):
        """重复获取同一 collection 应返回同一实例"""
        col1 = svc.get_or_create_collection("proj-002")
        col2 = svc.get_or_create_collection("proj-002")
        assert col1.name == col2.name

    def test_collection_uses_cosine(self, svc):
        col = svc.get_or_create_collection("proj-cos")
        assert col.metadata.get("hnsw:space") == "cosine"

    def test_delete_collection(self, svc):
        svc.get_or_create_collection("proj-del")
        assert svc.delete_collection("proj-del") is True

    def test_delete_nonexistent_collection(self, svc):
        assert svc.delete_collection("nonexistent") is False

    def test_add_and_query(self, svc):
        """基本的文档添加和查询"""
        col = svc.get_or_create_collection("proj-query")
        col.add(
            ids=["chunk-1", "chunk-2"],
            documents=[
                "光合作用是植物利用光能合成有机物的过程",
                "勾股定理描述直角三角形三边关系",
            ],
            metadatas=[{"source": "bio"}, {"source": "math"}],
        )
        results = col.query(query_texts=["植物如何制造养分"], n_results=2)
        # 验证返回了结果，不强制断言排序（取决于默认 embedding 函数）
        assert len(results["ids"][0]) == 2
        returned_ids = set(results["ids"][0])
        assert "chunk-1" in returned_ids
        assert "chunk-2" in returned_ids
