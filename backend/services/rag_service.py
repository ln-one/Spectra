"""
RAG Service - 检索增强生成服务

提供文本分块、向量化入库、语义检索等核心 RAG 能力。
"""

import logging
import re
from typing import Optional

from pydantic import BaseModel

from schemas.rag import ChunkContext, RAGResult, SourceDetail, SourceReference
from services.embedding_service import EmbeddingService, embedding_service
from services.vector_service import VectorService, vector_service

logger = logging.getLogger(__name__)

# 分块参数
DEFAULT_CHUNK_SIZE = 500  # tokens
DEFAULT_CHUNK_OVERLAP = 50  # tokens
# 中文 1 字 ≈ 1.5 token，用字符数估算
CHARS_PER_TOKEN = 0.67  # 1 token ≈ 0.67 个中文字符（反过来 1 字 ≈ 1.5 token）

# 分割符优先级
SEPARATORS = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"]


def _estimate_tokens(text: str) -> int:
    """估算文本 token 数（中英文混合）"""
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.5 + other_chars * 0.25)


def split_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    """
    递归字符分割

    分割符优先级：\\n\\n > \\n > 。！？.!?
    尽量在标点处断开，保持语义完整性。

    Args:
        text: 待分割文本
        chunk_size: 目标分块大小（token 数）
        chunk_overlap: 相邻块重叠大小（token 数）

    Returns:
        分块文本列表
    """
    if not text or not text.strip():
        return []

    max_chars = int(chunk_size * CHARS_PER_TOKEN)
    overlap_chars = int(chunk_overlap * CHARS_PER_TOKEN)

    # 如果文本足够短，直接返回
    if _estimate_tokens(text) <= chunk_size:
        return [text.strip()]

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + max_chars, len(text))

        # 如果不是最后一段，尝试在分割符处断开
        if end < len(text):
            best_split = -1
            for sep in SEPARATORS:
                # 在 [start + max_chars//2, end] 范围内找最后一个分割符
                search_start = start + max_chars // 2
                pos = text.rfind(sep, search_start, end)
                if pos > best_split:
                    best_split = pos + len(sep)

            if best_split > start:
                end = best_split

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # 下一段起始位置（减去重叠）
        start = end - overlap_chars if end < len(text) else end

    return chunks


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

    async def index_chunks(
        self, project_id: str, chunks: list[ParsedChunkData]
    ) -> int:
        """
        将分块数据向量化并存入 ChromaDB（幂等 upsert）

        Args:
            project_id: 项目 ID
            chunks: 待入库的分块列表

        Returns:
            成功入库的分块数量
        """
        if not chunks:
            return 0

        collection = self._vector.get_or_create_collection(project_id)
        texts = [c.content for c in chunks]
        ids = [c.chunk_id for c in chunks]
        metadatas = [c.metadata for c in chunks]

        # 批量 embedding
        embeddings = await self._embedding.embed_texts(texts)

        # upsert 到 ChromaDB
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )

        logger.info(
            f"Indexed {len(chunks)} chunks for project {project_id}"
        )
        return len(chunks)

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
            filters: 过滤条件 {"file_types": [...], "file_ids": [...]}

        Returns:
            检索结果列表
        """
        collection = self._vector.get_or_create_collection(project_id)

        # 检查 collection 是否有数据
        if collection.count() == 0:
            return []

        # 构建 ChromaDB where 过滤
        where = None
        if filters:
            conditions = []
            if filters.get("file_types"):
                conditions.append(
                    {"source_type": {"$in": filters["file_types"]}}
                )
            if filters.get("file_ids"):
                conditions.append(
                    {"upload_id": {"$in": filters["file_ids"]}}
                )
            if len(conditions) == 1:
                where = conditions[0]
            elif len(conditions) > 1:
                where = {"$and": conditions}

        # query 向量化
        query_embedding = await self._embedding.embed_text(query)

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        # 转换为 RAGResult
        rag_results = []
        if results["ids"] and results["ids"][0]:
            for i, chunk_id in enumerate(results["ids"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                distance = results["distances"][0][i] if results["distances"] else 0
                score = 1.0 - distance  # cosine distance → similarity

                rag_results.append(
                    RAGResult(
                        chunk_id=chunk_id,
                        content=results["documents"][0][i],
                        score=round(score, 4),
                        source=SourceReference(
                            chunk_id=chunk_id,
                            source_type=meta.get("source_type", "document"),
                            filename=meta.get("filename", ""),
                            page_number=meta.get("page_number"),
                        ),
                        metadata=meta,
                    )
                )

        return rag_results
    # PLACEHOLDER_MORE_METHODS
