import logging
from typing import Optional

from schemas.rag import RAGResult
from services.rag_service import retrieval_helpers as _retrieval_helpers
from services.rag_service.retrieval_helpers import (
    build_rag_results,
    build_where_clause,
    get_chunk_from_collection,
    list_active_reference_targets,
    query_collection,
    sort_key,
)

logger = logging.getLogger(__name__)
db_service = _retrieval_helpers.db_service


async def search(
    service,
    project_id: str,
    query: str,
    top_k: int = 5,
    filters: Optional[dict] = None,
    score_threshold: float = 0.0,
    session_id: Optional[str] = None,
) -> list[RAGResult]:
    collection = service._vector.get_collection_if_exists(project_id)
    collection_size = 0
    if collection is not None:
        collection_size = collection.count()
    if collection is None or collection_size == 0:
        collection = None

    query_embedding = await service._embedding.embed_text(query)
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
        for target in await list_active_reference_targets(project_id):
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
    return rag_results


async def get_chunk_detail(service, chunk_id: str, project_id: Optional[str] = None):
    if project_id:
        detail = await get_chunk_from_collection(service, chunk_id, project_id)
        if detail is not None:
            return detail
        for target in await list_active_reference_targets(project_id):
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
