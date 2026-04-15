import logging
from typing import Optional

from services.ai.multimodal_rag import build_multimodal_context
from utils.upstream_failures import classify_upstream_failure

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
            payload = [r.model_dump() for r in results]
            try:
                multimodal_context = await build_multimodal_context(
                    service,
                    query=query,
                    rag_results=results,
                )
            except Exception as multimodal_exc:
                logger.warning(
                    "Multimodal RAG hint skipped for project %s",
                    project_id,
                    extra={
                        "project_id": project_id,
                        "session_id": session_id,
                        "multimodal_failure_type": classify_upstream_failure(
                            multimodal_exc
                        ),
                    },
                    exc_info=True,
                )
                multimodal_context = []
            if multimodal_context:
                payload = multimodal_context + payload
            return payload
    except Exception as e:
        logger.warning(
            "RAG retrieval failed for project %s",
            project_id,
            extra={
                "project_id": project_id,
                "session_id": session_id,
                "rag_failure_type": classify_upstream_failure(e),
                "filters_present": bool(filters),
            },
            exc_info=True,
        )
    return None
