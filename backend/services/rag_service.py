"""
RAG Service - 检索增强生成服务骨架

提供文本分块、向量化入库、语义检索等核心 RAG 能力。
Phase 1 仅定义接口，Phase 2 填充实现。
"""

import logging
from typing import Optional

from pydantic import BaseModel

from schemas.rag import RAGResult, SourceDetail
from services.embedding_service import EmbeddingService, embedding_service
from services.vector_service import VectorService, vector_service

logger = logging.getLogger(__name__)


class ParsedChunkData(BaseModel):
    """待入库的分块数据"""

    chunk_id: str
    content: str
    metadata: dict  # upload_id, chunk_index, source_type, filename 等


class RAGService:
    """RAG 检索增强生成服务"""

    def __init__(
        self,
        vec_service: Optional[VectorService] = None,
        emb_service: Optional[EmbeddingService] = None,
    ):
        self._vector = vec_service or vector_service
        self._embedding = emb_service or embedding_service

    async def index_chunks(self, project_id: str, chunks: list[ParsedChunkData]) -> int:
        """
        将分块数据向量化并存入 ChromaDB

        Args:
            project_id: 项目 ID
            chunks: 待入库的分块列表

        Returns:
            成功入库的分块数量
        """
        raise NotImplementedError("Phase 2 实现")

    async def search(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
        filters: Optional[dict] = None,
    ) -> list[RAGResult]:
        """
        语义检索

        Args:
            project_id: 项目 ID
            query: 查询文本
            top_k: 返回结果数量
            filters: 过滤条件

        Returns:
            检索结果列表
        """
        raise NotImplementedError("Phase 2 实现")

    async def get_chunk_detail(self, chunk_id: str) -> SourceDetail:
        """
        获取分块详情（含上下文）

        Args:
            chunk_id: 分块 ID

        Returns:
            分块详情
        """
        raise NotImplementedError("Phase 2 实现")

    async def delete_project_index(self, project_id: str) -> bool:
        """
        删除项目的向量索引

        Args:
            project_id: 项目 ID

        Returns:
            是否删除成功
        """
        return self._vector.delete_collection(project_id)


# 全局实例
rag_service = RAGService()
