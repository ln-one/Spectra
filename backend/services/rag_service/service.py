"""RAG service facade backed by Stratumind."""

from services.rag_service.indexing import (
    delete_project_index,
    delete_upload_index,
    index_chunks,
)
from services.rag_service.retrieval import get_chunk_detail, search
from services.stratumind_client import stratumind_client


class RAGService:
    """RAG 检索增强生成服务。"""

    def __init__(self):
        self._client = stratumind_client

    async def index_chunks(
        self,
        project_id: str,
        chunks: list,
        *,
        return_details: bool = False,
    ):
        return await index_chunks(
            self,
            project_id,
            chunks,
            return_details=return_details,
        )

    async def search(
        self,
        project_id: str,
        query: str,
        top_k: int = 5,
        filters: dict | None = None,
        score_threshold: float = 0.0,
        session_id: str | None = None,
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

    async def get_chunk_detail(self, chunk_id: str, project_id: str | None = None):
        return await get_chunk_detail(self, chunk_id, project_id)

    async def delete_project_index(self, project_id: str) -> bool:
        return await delete_project_index(self, project_id)

    async def delete_upload_index(self, project_id: str, upload_id: str) -> int:
        return await delete_upload_index(self, project_id, upload_id)
