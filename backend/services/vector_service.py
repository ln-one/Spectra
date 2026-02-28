"""
Vector Service - ChromaDB 连接管理

提供 ChromaDB 向量数据库的初始化、collection 管理和生命周期管理。
"""

import logging
import os
from typing import Optional

import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.errors import NotFoundError

logger = logging.getLogger(__name__)

# 持久化路径，从环境变量读取
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

# Collection 名称前缀
COLLECTION_PREFIX = "spectra_project_"


class VectorService:
    """ChromaDB 向量数据库服务"""

    def __init__(self, persist_dir: Optional[str] = None):
        """
        初始化 VectorService

        Args:
            persist_dir: 持久化目录路径，默认从环境变量读取
        """
        self._persist_dir = persist_dir or CHROMA_PERSIST_DIR
        self._client: Optional[chromadb.ClientAPI] = None

    @property
    def client(self) -> chromadb.ClientAPI:
        """懒加载 ChromaDB 客户端"""
        if self._client is None:
            self._client = chromadb.PersistentClient(path=self._persist_dir)
            logger.info(
                "ChromaDB client initialized",
                extra={"persist_dir": self._persist_dir},
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
        try:
            return self.client.get_collection(name=name)
        except NotFoundError:
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
        try:
            self.client.delete_collection(name=name)
            logger.info(f"Collection deleted: {name}")
            return True
        except NotFoundError:
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
