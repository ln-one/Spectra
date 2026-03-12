"""
RAG Service - 检索增强生成服务

提供向量化入库、语义检索等核心 RAG 能力。
文本分块逻辑见 services/chunking.py。
"""

import logging
from typing import Optional

from pydantic import BaseModel

from schemas.rag import ChunkContext, RAGResult, SourceDetail, SourceReference
from services.embedding_service import EmbeddingService, embedding_service
from services.vector_service import Collection, VectorService, vector_service

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

        logger.info(f"Indexed {len(chunks)} chunks for project {project_id}")
        return len(chunks)

    async def search(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
        filters: Optional[dict] = None,
        score_threshold: float = 0.0,
        session_id: Optional[str] = None,
    ) -> list[RAGResult]:
        """
        语义检索

        Args:
            project_id: 项目 ID
            query: 查询文本
            top_k: 返回结果数量
            filters: 过滤条件 {"file_types": [...], "file_ids": [...]}
            score_threshold: 最低相似度阈值（0.0 表示不过滤），过滤低质量结果
            session_id: 会话 ID（C5 数据隔离）。提供时仅检索该 session 入库的分块，
                        不跨会话复用，防止同 project 多 session 间资料互串。

        Returns:
            检索结果列表（按 score 降序，已过滤低于阈值的结果）
        """
        collection = self._vector.get_collection_if_exists(project_id)
        if collection is None:
            return []

        # 检查 collection 是否有数据
        if collection.count() == 0:
            return []

        # 构建 ChromaDB where 过滤
        where = None
        conditions = []

        # C5 数据隔离：session_id 过滤（project_id + session_id 双重约束）
        if session_id:
            conditions.append({"session_id": {"$eq": session_id}})

        if filters:
            if filters.get("file_types"):
                conditions.append({"source_type": {"$in": filters["file_types"]}})
            if filters.get("file_ids"):
                conditions.append({"upload_id": {"$in": filters["file_ids"]}})

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
                raw_score = 1.0 - distance  # cosine distance → similarity
                score = max(0.0, min(1.0, raw_score))

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

        # 过滤低于阈值的结果
        if score_threshold > 0.0:
            before = len(rag_results)
            rag_results = [r for r in rag_results if r.score >= score_threshold]
            if len(rag_results) < before:
                logger.debug(
                    "score_threshold=%.2f filtered %d/%d results for project %s",
                    score_threshold,
                    before - len(rag_results),
                    before,
                    project_id,
                )

        return rag_results

    async def get_chunk_detail(
        self, chunk_id: str, project_id: Optional[str] = None
    ) -> Optional[SourceDetail]:
        """
        获取分块详情（含上下文）

        从 ChromaDB 获取内容，查询前后 chunk 作为上下文。

        Args:
            chunk_id: 分块 ID
            project_id: 项目 ID（如果已知，加速查找）

        Returns:
            分块详情，未找到返回 None
        """
        # 如果指定了 project_id，直接查对应 collection
        if project_id:
            return await self._get_chunk_from_collection(chunk_id, project_id)
        return None

    async def _get_chunk_from_collection(
        self, chunk_id: str, project_id: str
    ) -> Optional[SourceDetail]:
        """从指定 collection 获取 chunk 详情"""
        collection = self._vector.get_collection_if_exists(project_id)
        if collection is None:
            return None
        try:
            result = collection.get(ids=[chunk_id], include=["documents", "metadatas"])
        except Exception:
            return None

        if not result["ids"]:
            return None

        content = result["documents"][0]
        meta = result["metadatas"][0] if result["metadatas"] else {}

        # 查询上下文（前后 chunk）
        chunk_index = meta.get("chunk_index")
        upload_id = meta.get("upload_id")
        context = None
        if chunk_index is not None and upload_id:
            context = await self._get_chunk_context(collection, upload_id, chunk_index)

        return SourceDetail(
            chunk_id=chunk_id,
            content=content,
            source=SourceReference(
                chunk_id=chunk_id,
                source_type=meta.get("source_type", "document"),
                filename=meta.get("filename", ""),
                page_number=meta.get("page_number"),
            ),
            context=context,
        )

    async def _get_chunk_context(
        self, collection: Collection, upload_id: str, chunk_index: int
    ) -> Optional[ChunkContext]:
        """获取前后 chunk 作为上下文"""
        prev_chunk = None
        next_chunk = None

        for offset, attr in [(-1, "prev"), (1, "next")]:
            target_idx = chunk_index + offset
            if target_idx < 0:
                continue
            try:
                result = collection.get(
                    where={
                        "$and": [
                            {"upload_id": upload_id},
                            {"chunk_index": target_idx},
                        ]
                    },
                    include=["documents"],
                )
                if result["ids"] and result["documents"]:
                    if attr == "prev":
                        prev_chunk = result["documents"][0]
                    else:
                        next_chunk = result["documents"][0]
            except Exception:
                pass

        if prev_chunk or next_chunk:
            return ChunkContext(previous_chunk=prev_chunk, next_chunk=next_chunk)
        return None

    async def delete_project_index(self, project_id: str) -> bool:
        """删除项目的向量索引"""
        return self._vector.delete_collection(project_id)

    async def delete_upload_index(self, project_id: str, upload_id: str) -> int:
        """删除某个上传文件对应的向量分块，返回删除前命中数。"""
        collection = self._vector.get_collection_if_exists(project_id)
        if collection is None:
            return 0

        try:
            existing = collection.get(where={"upload_id": upload_id}, include=[])
            count = len(existing.get("ids", []))
            if count > 0:
                collection.delete(where={"upload_id": upload_id})
            return count
        except Exception:
            logger.warning(
                "Failed to delete upload index",
                extra={"project_id": project_id, "upload_id": upload_id},
                exc_info=True,
            )
            return 0


# 全局实例
rag_service = RAGService()
