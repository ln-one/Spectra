import logging
import os
import re
from difflib import SequenceMatcher
from typing import Optional

from prisma.errors import ClientNotConnectedError

from schemas.rag import RAGResult
from services.database import db_service
from services.rag_service.retrieval_helpers import (
    build_rag_results,
    build_where_clause,
    get_chunk_from_collection,
    query_collection,
    sort_key,
)

logger = logging.getLogger(__name__)

_NORMALIZE_RE = re.compile(r"[^\w\u4e00-\u9fff]+", re.UNICODE)
_TOKEN_RE = re.compile(r"[A-Za-z0-9_+#\-.]{2,}|[\u4e00-\u9fff]{2,}", re.UNICODE)
_STOP_TOKENS = {"这个", "我们", "你们", "他们", "以及", "进行", "需要", "支持", "要求", "系统", "项目", "内容", "资料", "the", "and", "for", "with", "that", "this"}


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw.strip())
    except ValueError:
        return default
    return value if 0 < value <= 1 else default


def _normalize_text(text: str) -> str:
    compact = " ".join(str(text or "").split()).lower()
    compact = _NORMALIZE_RE.sub(" ", compact)
    return " ".join(compact.split())


def _fingerprint_text(text: str) -> str:
    return _normalize_text(text).replace(" ", "")


def _tokenize(text: str) -> list[str]:
    normalized = _normalize_text(text)
    if not normalized:
        return []
    tokens = []
    for token in _TOKEN_RE.findall(normalized):
        compact = token.strip().lower()
        if len(compact) < 2 or compact in _STOP_TOKENS:
            continue
        tokens.append(compact)
    return tokens


def _jaccard_similarity(tokens_a: set[str], tokens_b: set[str]) -> float:
    if not tokens_a or not tokens_b:
        return 0.0
    union = tokens_a | tokens_b
    return len(tokens_a & tokens_b) / len(union) if union else 0.0


def _string_similarity(text_a: str, text_b: str) -> float:
    if not text_a or not text_b:
        return 0.0
    return SequenceMatcher(None, text_a, text_b).ratio()


def _same_document(item_a: RAGResult, item_b: RAGResult) -> bool:
    source_a = item_a.source
    source_b = item_b.source
    if not source_a or not source_b:
        return False
    file_id_a = getattr(source_a, "file_id", None)
    file_id_b = getattr(source_b, "file_id", None)
    if file_id_a and file_id_a == file_id_b:
        return True
    filename_a = str(getattr(source_a, "filename", "") or "").strip().lower()
    filename_b = str(getattr(source_b, "filename", "") or "").strip().lower()
    return bool(filename_a and filename_a == filename_b)


def _are_near_duplicates(item_a: RAGResult, item_b: RAGResult, threshold: float) -> bool:
    if item_a.chunk_id == item_b.chunk_id:
        return True
    fp_a = _fingerprint_text(item_a.content)
    fp_b = _fingerprint_text(item_b.content)
    if fp_a and fp_a == fp_b:
        return True
    tokens_a = set(_tokenize(item_a.content))
    tokens_b = set(_tokenize(item_b.content))
    jaccard = _jaccard_similarity(tokens_a, tokens_b)
    string_sim = _string_similarity(fp_a, fp_b)
    if max(jaccard, string_sim) >= threshold:
        return True
    if _same_document(item_a, item_b):
        meta_a = item_a.metadata or {}
        meta_b = item_b.metadata or {}
        idx_a = meta_a.get("chunk_index")
        idx_b = meta_b.get("chunk_index")
        if isinstance(idx_a, int) and isinstance(idx_b, int) and abs(idx_a - idx_b) <= 1:
            if max(jaccard, string_sim) >= max(0.72, threshold - 0.1):
                return True
    return False


def _chunk_quality(item: RAGResult, query_terms: set[str]) -> float:
    tokens = set(_tokenize(item.content))
    overlap = len(tokens & query_terms)
    normalized = _normalize_text(item.content)
    exact_hits = sum(1 for term in query_terms if term and term in normalized)
    unique_ratio = len(tokens) / max(1, len(_tokenize(item.content)))
    return (overlap * 2.5) + (exact_hits * 1.2) + (item.score * 3.0) + unique_ratio


def _query_aware_rerank(results: list[RAGResult], query: str, boost_factor: float = 0.15) -> list[RAGResult]:
    """Boost chunks with higher query term overlap"""
    if len(results) <= 1:
        return results

    query_terms = set(_tokenize(query))
    if not query_terms:
        return results

    scored = []
    for item in results:
        content_tokens = set(_tokenize(item.content))
        overlap = len(content_tokens & query_terms)
        normalized_content = _normalize_text(item.content)
        exact_hits = sum(1 for term in query_terms if term and term in normalized_content)

        # Boost score based on query relevance
        boost = (overlap * 0.02) + (exact_hits * 0.03)
        adjusted_score = item.score * (1 + boost * boost_factor)

        scored.append((adjusted_score, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored]


async def _list_active_reference_targets(project_id: str) -> list[dict]:
    try:
        references = await db_service.get_project_references(project_id)
    except ClientNotConnectedError:
        return []
    except Exception as exc:
        logger.warning(
            "reference target lookup failed for project %s: %s", project_id, exc
        )
        return []
    return [
        {
            "source_project_id": reference.targetProjectId,
            "source_scope": (
                "reference_base"
                if reference.relationType == "base"
                else "reference_auxiliary"
            ),
            "relation_type": reference.relationType,
            "reference_mode": reference.mode,
            "reference_priority": reference.priority,
            "pinned_version_id": getattr(reference, "pinnedVersionId", None),
        }
        for reference in references
    ]


async def search(
    service,
    project_id: str,
    query: str,
    top_k: int = 5,
    filters: Optional[dict] = None,
    score_threshold: float = 0.0,
    session_id: Optional[str] = None,
) -> list[RAGResult]:
    # Query rewriting for better retrieval
    from services.rag_service.query_rewriter import rewrite_query
    rewritten_query = await rewrite_query(query)

    collection = service._vector.get_collection_if_exists(project_id)
    collection_size = 0
    if collection is not None:
        collection_size = collection.count()
    if collection is None or collection_size == 0:
        collection = None

    query_embedding = await service._embedding.embed_text(rewritten_query)
    base_where = build_where_clause(filters=filters)
    result_sets = []
    session_where = build_where_clause(session_id=session_id, filters=filters)

    if collection is not None and session_where is not None:
        local_session_result = query_collection(
            collection,
            query_embedding,
            top_k,
            session_where,
            collection_size=collection_size,
        )
        if local_session_result is not None:
            result_sets.append(
                (
                    local_session_result,
                    {
                        "source_project_id": project_id,
                        "source_scope": "local_session",
                    },
                )
            )
    if collection is not None:
        local_project_result = query_collection(
            collection,
            query_embedding,
            top_k,
            base_where,
            collection_size=collection_size,
        )
        if local_project_result is not None:
            result_sets.append(
                (
                    local_project_result,
                    {
                        "source_project_id": project_id,
                        "source_scope": "local_project",
                    },
                )
            )

    if not (filters and filters.get("file_ids")):
        for target in await _list_active_reference_targets(project_id):
            target_collection = service._vector.get_collection_if_exists(
                target["source_project_id"]
            )
            if target_collection is None:
                continue
            target_collection_size = target_collection.count()
            if target_collection_size == 0:
                continue
            target_result = query_collection(
                target_collection,
                query_embedding,
                top_k,
                base_where,
                collection_size=target_collection_size,
            )
            if target_result is None:
                continue
            result_sets.append(
                (
                    target_result,
                    target,
                )
            )

    merged_by_chunk: dict[str, RAGResult] = {}
    for raw_result, source_info in result_sets:
        for item in build_rag_results(raw_result, **source_info):
            existing = merged_by_chunk.get(item.chunk_id)
            if existing is None or sort_key(item) < sort_key(existing):
                merged_by_chunk[item.chunk_id] = item

    rag_results = sorted(merged_by_chunk.values(), key=sort_key)[:top_k]

    if score_threshold > 0.0:
        rag_results = [r for r in rag_results if r.score >= score_threshold]

    enable_rerank = _env_bool("RAG_ENABLE_QUERY_RERANK", False)
    boost_factor = _env_float("RAG_QUERY_BOOST_FACTOR", 0.15)

    if enable_rerank and len(rag_results) > 1:
        rag_results = _query_aware_rerank(rag_results, query, boost_factor)

    # Cross-Encoder Reranking
    enable_cross_rerank = _env_bool("RAG_ENABLE_CROSS_RERANK", True)
    if enable_cross_rerank and len(rag_results) > 1:
        from services.rag_service.reranker import get_reranker
        try:
            reranker = get_reranker()
            documents = [r.content for r in rag_results]
            ranked_indices = reranker.rerank(query, documents, top_k=len(rag_results))
            rag_results = [rag_results[idx] for idx, _ in ranked_indices]
        except Exception as e:
            logger.warning(f"重排序失败，使用原始排序: {e}")

    return rag_results[:top_k]


async def get_chunk_detail(service, chunk_id: str, project_id: Optional[str] = None):
    if project_id:
        detail = await get_chunk_from_collection(service, chunk_id, project_id)
        if detail is not None:
            return detail
        for target in await _list_active_reference_targets(project_id):
            detail = await get_chunk_from_collection(
                service, chunk_id, target["source_project_id"]
            )
            if detail is not None:
                if detail.file_info is None:
                    detail.file_info = {}
                detail.file_info.update(
                    {
                        "source_project_id": target["source_project_id"],
                        "source_scope": target["source_scope"],
                        "reference_relation_type": target["relation_type"],
                        "reference_mode": target["reference_mode"],
                        "reference_priority": target["reference_priority"],
                        "pinned_version_id": target["pinned_version_id"],
                    }
                )
                return detail
    return None
