"""
VectorService 单元测试

使用 tmp_path 创建临时 ChromaDB 持久化目录，不污染项目数据。
"""

import pytest
from chromadb.errors import InternalError

from services.media.vector import VectorService


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

    def test_get_collection_if_exists(self, svc):
        assert svc.get_collection_if_exists("proj-missing") is None
        created = svc.get_or_create_collection("proj-exists")
        fetched = svc.get_collection_if_exists("proj-exists")
        assert fetched is not None
        assert fetched.name == created.name

    def test_collection_uses_cosine(self, svc):
        col = svc.get_or_create_collection("proj-cos")
        assert col.metadata.get("hnsw:space") == "cosine"

    def test_delete_collection(self, svc):
        svc.get_or_create_collection("proj-del")
        assert svc.delete_collection("proj-del") is True

    def test_delete_nonexistent_collection(self, svc):
        assert svc.delete_collection("nonexistent") is False

    def test_delete_collection_unexpected_error_raises(self, svc, monkeypatch):
        def _raise_internal_error(name):
            raise InternalError("boom")

        monkeypatch.setattr(svc.client, "delete_collection", _raise_internal_error)

        with pytest.raises(InternalError):
            svc.delete_collection("proj-error")

    def test_persistent_mode_ignores_http_host(self, svc, monkeypatch):
        monkeypatch.setenv("CHROMA_MODE", "persistent")
        monkeypatch.setenv("CHROMA_HOST", "chromadb")

        persistent_calls = []

        class DummyClient:
            def heartbeat(self):
                return 1

        monkeypatch.setattr(
            "services.media.vector.chromadb.PersistentClient",
            lambda path: persistent_calls.append(path) or DummyClient(),
        )
        monkeypatch.setattr(
            "services.media.vector.chromadb.HttpClient",
            lambda **kwargs: pytest.fail("http mode should not be used"),
        )

        svc.client

        assert persistent_calls == [svc._persist_dir]

    def test_http_mode_prefers_http_client(self, svc, monkeypatch):
        monkeypatch.setenv("CHROMA_MODE", "http")
        monkeypatch.setenv("CHROMA_HOST", "chromadb")
        monkeypatch.setenv("CHROMA_PORT", "8000")
        monkeypatch.setattr(
            "services.media.vector.socket.create_connection",
            lambda *args, **kwargs: MockSocket(),
        )

        http_calls = []

        class DummyClient:
            def heartbeat(self):
                return 1

        monkeypatch.setattr(
            "services.media.vector.chromadb.HttpClient",
            lambda host, port: http_calls.append((host, port)) or DummyClient(),
        )

        svc.client

        assert http_calls == [("chromadb", "8000")]

    def test_add_and_query(self, svc):
        """基本的向量添加和查询（使用显式 embedding，避免依赖默认模型）"""
        col = svc.get_or_create_collection("proj-query")
        # 使用固定的嵌入向量，保证测试稳定且不触发默认 embedding 模型下载
        embeddings = [
            [1.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
        ]
        col.add(
            ids=["chunk-1", "chunk-2"],
            embeddings=embeddings,
            metadatas=[{"source": "bio"}, {"source": "math"}],
        )
        results = col.query(query_embeddings=[[1.0, 0.0, 0.0]], n_results=2)
        # 验证返回了结果，不强制断言排序（由向量相似度决定）
        assert len(results["ids"][0]) == 2
        returned_ids = set(results["ids"][0])
        assert "chunk-1" in returned_ids
        assert "chunk-2" in returned_ids


class MockSocket:
    def close(self):
        return None
