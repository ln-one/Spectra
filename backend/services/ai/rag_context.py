import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def retrieve_rag_context(
    service,
    project_id: str,
    query: str,
    top_k: int = 5,
    score_threshold: float = 0.3,
    session_id: Optional[str] = None,
    filters: Optional[dict] = None,
) -> Optional[list[dict]]:
    from services.rag_service import rag_service

    try:
        results = await rag_service.search(
            project_id=project_id,
            query=query,
            top_k=top_k,
            score_threshold=score_threshold,
            session_id=session_id,
            filters=filters,
        )
        if results:
            return [r.model_dump() for r in results]
    except Exception as e:
        logger.warning("RAG retrieval failed for project %s: %s", project_id, e)
    return None
