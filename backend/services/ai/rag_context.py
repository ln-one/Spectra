import logging
import time
from typing import Optional

from services.rag_service.context_postprocess import (
    log_context_processing,
    postprocess_rag_context,
)
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

    retrieval_started = time.perf_counter()

    async def _llm_compressor(
        query_text: str,
        content: str,
        max_sentences: int,
    ) -> str | None:
        prompt = (
            "你是检索证据压缩器。"
            "只保留与问题最相关、最能支撑回答的原文句子。"
            "不要改写，不要补充，不要总结，不要伪造新事实。"
            f"最多返回 {max_sentences} 句原文。\n\n"
            f"问题：{query_text}\n\n"
            f"原始片段：\n{content}"
        )
        response = await service.generate(prompt=prompt, max_tokens=300)
        compressed = str(response.get("content") or "").strip()
        return compressed or None

    try:
        results = await rag_service.search(
            project_id=project_id,
            query=query,
            top_k=top_k,
            score_threshold=score_threshold,
            session_id=session_id,
            filters=filters,
        )
        serialized = [r.model_dump() for r in results] if results else []
        retrieval_latency_ms = (time.perf_counter() - retrieval_started) * 1000
        processed, diagnostics = await postprocess_rag_context(
            query=query,
            rag_results=serialized,
            llm_compressor=_llm_compressor,
        )
        log_context_processing(
            request_logger=logger,
            retrieval_latency_ms=retrieval_latency_ms,
            diagnostics=diagnostics,
            project_id=project_id,
            query=query,
            session_id=session_id,
            caller="ai_service",
        )
        if processed:
            return processed
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
