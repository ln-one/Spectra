"""RAG service."""

from typing import Optional

from services.embedding_service import EmbeddingService, embedding_service
from services.rag_service.indexing import (
    delete_project_index,
    delete_upload_index,
    index_chunks,
)
from services.rag_service.retrieval import get_chunk_detail, search
from services.vector_service import VectorService, vector_service


class RAGService:
    """RAG 检索增强生成服务。"""

    def __init__(
        self,
        vec_service: Optional[VectorService] = None,
        emb_service: Optional[EmbeddingService] = None,
    ):
        self._vector = vec_service or vector_service
        self._embedding = emb_service or embedding_service

    async def index_chunks(self, project_id: str, chunks: list) -> int:
        return await index_chunks(self, project_id, chunks)

    async def search(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
        filters: Optional[dict] = None,
        score_threshold: float = 0.0,
        session_id: Optional[str] = None,
    ):
        return await search(
            self,
            project_id=project_id,
            query=query,
            top_k=top_k,
            filters=filters,
            score_threshold=score_threshold,
            session_id=session_id,
        )

    async def get_chunk_detail(self, chunk_id: str, project_id: Optional[str] = None):
        return await get_chunk_detail(self, chunk_id, project_id)

    async def delete_project_index(self, project_id: str) -> bool:
        return await delete_project_index(self, project_id)

    async def delete_upload_index(self, project_id: str, upload_id: str) -> int:
        return await delete_upload_index(self, project_id, upload_id)
