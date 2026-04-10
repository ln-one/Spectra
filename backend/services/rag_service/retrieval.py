import logging
from typing import Optional

from schemas.rag import ChunkContext, RAGResult, SourceDetail, SourceReference
from services.database import db_service
from services.rag_service.retrieval_helpers import list_active_reference_targets, sort_key
from services.stratumind_client import StratumindClientError

logger = logging.getLogger(__name__)


def _normalize_result(
    payload: dict,
    *,
    source_project_id: str,
    source_scope: str,
    relation_type: Optional[str] = None,
    reference_mode: Optional[str] = None,
    reference_priority: Optional[int] = None,
    pinned_version_id: Optional[str] = None,
) -> RAGResult:
    metadata = dict(payload.get("metadata") or {})
    metadata.setdefault("source_project_id", source_project_id)
    metadata.setdefault("source_scope", source_scope)
    if relation_type is not None:
        metadata.setdefault("reference_relation_type", relation_type)
    if reference_mode is not None:
        metadata.setdefault("reference_mode", reference_mode)
    if reference_priority is not None:
        metadata.setdefault("reference_priority", reference_priority)
    if pinned_version_id is not None:
        metadata.setdefault("pinned_version_id", pinned_version_id)
    return RAGResult(
        chunk_id=str(payload.get("chunk_id") or ""),
        content=str(payload.get("content") or ""),
        score=float(payload.get("score") or 0.0),
        source=SourceReference(
            chunk_id=str(payload.get("chunk_id") or ""),
            source_type=payload.get("source_type") or metadata.get("source_type") or "document",
            filename=str(payload.get("filename") or ""),
            page_number=payload.get("page_number"),
        ),
        metadata=metadata,
    )


async def search(
    service,
    project_id: str,
    query: str,
    top_k: int = 5,
    filters: Optional[dict] = None,
    score_threshold: float = 0.0,
    session_id: Optional[str] = None,
) -> list[RAGResult]:
    result_sets = []
    if session_id:
        try:
            local_session_result = await service._client.search_text(
                project_id=project_id,
                query=query,
                top_k=top_k,
                session_id=session_id,
                filters=filters,
            )
            if local_session_result.get("results"):
                result_sets.append(
                    (
                        local_session_result["results"],
                        {"source_project_id": project_id, "source_scope": "local_session"},
                    )
                )
        except StratumindClientError as exc:
            if exc.code != "PROJECT_NOT_INDEXED":
                raise

    try:
        local_project_result = await service._client.search_text(
            project_id=project_id,
            query=query,
            top_k=top_k,
            session_id=None,
            filters=filters,
        )
        if local_project_result.get("results"):
            result_sets.append(
                (
                    local_project_result["results"],
                    {"source_project_id": project_id, "source_scope": "local_project"},
                )
            )
    except StratumindClientError as exc:
        if exc.code != "PROJECT_NOT_INDEXED":
            raise

    if not (filters and filters.get("file_ids")):
        for target in await list_active_reference_targets(project_id):
            try:
                target_result = await service._client.search_text(
                    project_id=target["source_project_id"],
                    query=query,
                    top_k=top_k,
                    session_id=None,
                    filters=filters,
                )
            except StratumindClientError as exc:
                if exc.code == "PROJECT_NOT_INDEXED":
                    continue
                raise
            if not target_result.get("results"):
                continue
            result_sets.append(
                (
                    target_result["results"],
                    target,
                )
            )

    merged_by_chunk: dict[str, RAGResult] = {}
    for payloads, source_info in result_sets:
        for payload in payloads:
            item = _normalize_result(payload, **source_info)
            existing = merged_by_chunk.get(item.chunk_id)
            if existing is None or sort_key(item) < sort_key(existing):
                merged_by_chunk[item.chunk_id] = item

    rag_results = sorted(merged_by_chunk.values(), key=sort_key)[:top_k]

    if score_threshold > 0.0:
        rag_results = [r for r in rag_results if r.score >= score_threshold]
    return rag_results


async def get_chunk_detail(service, chunk_id: str, project_id: Optional[str] = None):
    if project_id:
        try:
            detail_payload = await service._client.get_source_detail(
                project_id=project_id,
                chunk_id=chunk_id,
            )
        except StratumindClientError as exc:
            if exc.code != "NOT_FOUND":
                raise
            detail_payload = None
        if detail_payload is not None:
            return SourceDetail(
                chunk_id=str(detail_payload.get("chunk_id") or chunk_id),
                content=str(detail_payload.get("content") or ""),
                source=SourceReference(
                    chunk_id=str(detail_payload.get("chunk_id") or chunk_id),
                    source_type=detail_payload.get("source_type") or "document",
                    filename=str(detail_payload.get("filename") or ""),
                    page_number=detail_payload.get("page_number"),
                ),
                context=(
                    ChunkContext(
                        previous_chunk=str((detail_payload.get("context") or {}).get("previous_chunk") or ""),
                        next_chunk=str((detail_payload.get("context") or {}).get("next_chunk") or ""),
                    )
                    if detail_payload.get("context")
                    else None
                ),
            )
        for target in await list_active_reference_targets(project_id):
            try:
                detail_payload = await service._client.get_source_detail(
                    project_id=target["source_project_id"],
                    chunk_id=chunk_id,
                )
            except StratumindClientError as exc:
                if exc.code == "NOT_FOUND":
                    continue
                raise
            if detail_payload is not None:
                detail = SourceDetail(
                    chunk_id=str(detail_payload.get("chunk_id") or chunk_id),
                    content=str(detail_payload.get("content") or ""),
                    source=SourceReference(
                        chunk_id=str(detail_payload.get("chunk_id") or chunk_id),
                        source_type=detail_payload.get("source_type") or "document",
                        filename=str(detail_payload.get("filename") or ""),
                        page_number=detail_payload.get("page_number"),
                    ),
                    context=(
                        ChunkContext(
                            previous_chunk=str((detail_payload.get("context") or {}).get("previous_chunk") or ""),
                            next_chunk=str((detail_payload.get("context") or {}).get("next_chunk") or ""),
                        )
                        if detail_payload.get("context")
                        else None
                    ),
                )
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
