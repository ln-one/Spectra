"""
Vector Service - ChromaDB 连接管理

提供 ChromaDB 向量数据库的初始化、collection 管理和生命周期管理。
"""

import logging
import os
import socket
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from services.runtime_paths import get_chroma_persist_dir

try:
    import chromadb
    from chromadb.api.models.Collection import Collection as ChromaCollection
    from chromadb.errors import NotFoundError as ChromaNotFoundError

    _CHROMA_AVAILABLE = True
    _CHROMA_IMPORT_ERROR: Exception | None = None
except Exception as exc:  # pragma: no cover - fallback for unsupported envs
    chromadb = None  # type: ignore
    ChromaCollection = object  # type: ignore
    ChromaNotFoundError = Exception  # type: ignore
    _CHROMA_AVAILABLE = False
    _CHROMA_IMPORT_ERROR = exc

logger = logging.getLogger(__name__)

# Collection 名称前缀
COLLECTION_PREFIX = "spectra_project_"


class InMemoryCollection:
    """轻量内存 collection，用于无 ChromaDB 环境下的测试兜底。"""

    def __init__(self) -> None:
        self._docs: Dict[str, Tuple[str, Dict[str, Any], List[float]]] = {}

    def upsert(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
    ) -> None:
        for idx, doc_id in enumerate(ids):
            self._docs[doc_id] = (documents[idx], metadatas[idx], embeddings[idx])

    def count(self) -> int:
        return len(self._docs)

    def get(
        self,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
        include: Optional[List[str]] = None,
    ) -> Dict[str, List[Any]]:
        def match_where(meta: Dict[str, Any]) -> bool:
            if not where:
                return True
            if "$and" in where:
                return all(match_where(cond) for cond in where["$and"])
            for key, cond in where.items():
                if "$eq" in cond and meta.get(key) != cond["$eq"]:
                    return False
                if "$in" in cond and meta.get(key) not in cond["$in"]:
                    return False
            return True

        items = []
        for doc_id, (doc, meta, _emb) in self._docs.items():
            if ids is not None and doc_id not in ids:
                continue
            if not match_where(meta):
                continue
            items.append((doc_id, doc, meta))

        return {
            "ids": [item[0] for item in items],
            "documents": [item[1] for item in items],
            "metadatas": [item[2] for item in items],
        }

    def query(
        self,
        query_embeddings: List[List[float]],
        n_results: int,
        where: Optional[Dict[str, Any]] = None,
        include: Optional[List[str]] = None,
    ) -> Dict[str, List[List[Any]]]:
        # 简单的相似度排序（余弦近似，避免依赖外部库）
        def score(vec_a: List[float], vec_b: List[float]) -> float:
            dot = sum(a * b for a, b in zip(vec_a, vec_b))
            norm_a = sum(a * a for a in vec_a) ** 0.5
            norm_b = sum(b * b for b in vec_b) ** 0.5
            if norm_a == 0 or norm_b == 0:
                return 0.0
            return dot / (norm_a * norm_b)

        def match_where(meta: Dict[str, Any]) -> bool:
            if not where:
                return True
            if "$and" in where:
                return all(match_where(cond) for cond in where["$and"])
            for key, cond in where.items():
                if "$eq" in cond and meta.get(key) != cond["$eq"]:
                    return False
                if "$in" in cond and meta.get(key) not in cond["$in"]:
                    return False
            return True

        query_vec = query_embeddings[0]
        scored = []
        for doc_id, (doc, meta, emb) in self._docs.items():
            if not match_where(meta):
                continue
            scored.append((score(query_vec, emb), doc_id, doc, meta))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:n_results]

        ids = [[item[1] for item in top]]
        documents = [[item[2] for item in top]]
        metadatas = [[item[3] for item in top]]
        distances = [[1.0 - item[0] for item in top]]
        return {
            "ids": ids,
            "documents": documents,
            "metadatas": metadatas,
            "distances": distances,
        }


Collection = ChromaCollection if _CHROMA_AVAILABLE else InMemoryCollection

if TYPE_CHECKING:
    import chromadb as chromadb_types


class VectorService:
    """ChromaDB 向量数据库服务"""

    def __init__(self, persist_dir: Optional[str] = None):
        """
        初始化 VectorService

        Args:
            persist_dir: 持久化目录路径，默认从环境变量读取
        """
        self._persist_dir = persist_dir or str(get_chroma_persist_dir())
        self._client: Optional[Any] = None
        self._memory_collections: Dict[str, InMemoryCollection] = {}

    @staticmethod
    def _resolve_chroma_mode() -> str:
        mode = (os.getenv("CHROMA_MODE") or "").strip().lower()
        if mode in {"http", "persistent"}:
            return mode
        return "http" if os.getenv("CHROMA_HOST") else "persistent"

    @property
    def client(self) -> "chromadb_types.ClientAPI | Any":
        """懒加载 ChromaDB 客户端"""
        if not _CHROMA_AVAILABLE:
            raise RuntimeError(
                "ChromaDB is unavailable in this environment. "
                "Install chromadb or use the in-memory fallback."
            ) from _CHROMA_IMPORT_ERROR
        if self._client is None:
            chroma_mode = self._resolve_chroma_mode()
            chroma_host = os.getenv("CHROMA_HOST")
            chroma_port = os.getenv("CHROMA_PORT", "8000")

            if chroma_mode == "http" and chroma_host:
                # 先做一次快速连通性检查，避免服务未启动导致请求卡死
                try:
                    socket.create_connection(
                        (chroma_host, int(chroma_port)), timeout=0.5
                    ).close()
                    self._client = chromadb.HttpClient(
                        host=chroma_host,
                        port=chroma_port,
                    )
                    logger.info(
                        "ChromaDB HttpClient initialized (server mode)",
                        extra={
                            "host": chroma_host,
                            "port": chroma_port,
                            "mode": chroma_mode,
                        },
                    )
                except Exception as exc:
                    logger.warning(
                        (
                            "ChromaDB server unreachable, "
                            "fallback to local PersistentClient: %s"
                        ),
                        exc,
                    )
                    self._client = chromadb.PersistentClient(path=self._persist_dir)
                    logger.info(
                        "ChromaDB PersistentClient initialized (local mode)",
                        extra={
                            "persist_dir": self._persist_dir,
                            "mode": "persistent",
                        },
                    )
            else:
                self._client = chromadb.PersistentClient(path=self._persist_dir)
                logger.info(
                    "ChromaDB PersistentClient initialized (local mode)",
                    extra={
                        "persist_dir": self._persist_dir,
                        "mode": "persistent",
                    },
                )
        return self._client

    def get_or_create_collection(self, project_id: str) -> Collection:
        """
        获取或创建项目级 collection

        Args:
            project_id: 项目 ID

        Returns:
            ChromaDB Collection 实例
        """
        name = f"{COLLECTION_PREFIX}{project_id}"
        if not _CHROMA_AVAILABLE:
            collection = self._memory_collections.get(name)
            if collection is None:
                collection = InMemoryCollection()
                self._memory_collections[name] = collection
            return collection
        collection = self.client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.debug(f"Collection ready: {name}")
        return collection

    def get_collection_if_exists(self, project_id: str) -> Optional[Collection]:
        """
        获取已存在的项目 collection，不存在时返回 None

        用于检索场景，避免仅因为查询而创建空 collection。
        """
        name = f"{COLLECTION_PREFIX}{project_id}"
        if not _CHROMA_AVAILABLE:
            return self._memory_collections.get(name)
        try:
            return self.client.get_collection(name=name)
        except ChromaNotFoundError:
            return None

    def delete_collection(self, project_id: str) -> bool:
        """
        删除项目的 collection

        Args:
            project_id: 项目 ID

        Returns:
            是否删除成功
        """
        name = f"{COLLECTION_PREFIX}{project_id}"
        if not _CHROMA_AVAILABLE:
            if name in self._memory_collections:
                del self._memory_collections[name]
                return True
            return False
        try:
            self.client.delete_collection(name=name)
            logger.info(f"Collection deleted: {name}")
            return True
        except ChromaNotFoundError:
            logger.warning(f"Collection not found: {name}")
            return False
        except Exception:
            logger.error("Failed to delete collection: %s", name, exc_info=True)
            raise

    def health_check(self) -> bool:
        """
        检查 ChromaDB 连接状态

        Returns:
            True 表示连接正常
        """
        try:
            self.client.heartbeat()
            return True
        except Exception as e:
            logger.error(f"ChromaDB health check failed: {e}")
            return False


# 全局实例
vector_service = VectorService()
