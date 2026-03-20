import logging
from typing import Optional

from prisma.errors import ClientNotConnectedError

from schemas.common import normalize_source_type
from schemas.rag import ChunkContext, RAGResult, SourceDetail, SourceReference
from services.database import db_service
from services.media.vector import Collection

logger = logging.getLogger(__name__)


def _build_where_clause(
    *,
    session_id: Optional[str] = None,
    filters: Optional[dict] = None,
) -> Optional[dict]:
    conditions = []
    if session_id:
        conditions.append({"session_id": {"$eq": session_id}})
    if filters:
        if filters.get("file_types"):
            normalized_types = sorted(
                {normalize_source_type(v).value for v in filters["file_types"]}
            )
            conditions.append({"source_type": {"$in": normalized_types}})
        if filters.get("file_ids"):
            conditions.append({"upload_id": {"$in": filters["file_ids"]}})
    if len(conditions) == 1:
        return conditions[0]
    if len(conditions) > 1:
        return {"$and": conditions}
    return None


def _build_rag_results(
    results,
    *,
    source_project_id: str,
    source_scope: str,
    relation_type: Optional[str] = None,
    reference_mode: Optional[str] = None,
    reference_priority: Optional[int] = None,
    pinned_version_id: Optional[str] = None,
) -> list[RAGResult]:
    rag_results = []
    if results["ids"] and results["ids"][0]:
        for i, chunk_id in enumerate(results["ids"][0]):
            raw_meta = results["metadatas"][0][i] if results["metadatas"] else {}
            meta = dict(raw_meta or {})
            meta.setdefault("source_project_id", source_project_id)
            meta.setdefault("source_scope", source_scope)
            if relation_type is not None:
                meta.setdefault("reference_relation_type", relation_type)
            if reference_mode is not None:
                meta.setdefault("reference_mode", reference_mode)
            if reference_priority is not None:
                meta.setdefault("reference_priority", reference_priority)
            if pinned_version_id is not None:
                meta.setdefault("pinned_version_id", pinned_version_id)
            distance = results["distances"][0][i] if results["distances"] else 0
            score = max(0.0, min(1.0, 1.0 - distance))
            rag_results.append(
                RAGResult(
                    chunk_id=chunk_id,
                    content=results["documents"][0][i],
                    score=round(score, 4),
                    source=SourceReference(
                        chunk_id=chunk_id,
                        source_type=normalize_source_type(
                            meta.get("source_type", "document")
                        ),
                        filename=meta.get("filename", ""),
                        page_number=meta.get("page_number"),
                    ),
                    metadata=meta,
                )
            )
    return rag_results


async def _list_active_reference_targets(project_id: str) -> list[dict]:
    try:
        references = await db_service.get_project_references(project_id)
    except ClientNotConnectedError:
        return []
    except Exception as exc:
        logger.warning(
            "reference target lookup failed for project %s: %s",
            project_id,
            exc,
        )
        return []
    targets = []
    for reference in references:
        targets.append(
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
        )
    return targets


def _sort_key(item: RAGResult) -> tuple[int, int, float]:
    meta = item.metadata or {}
    source_scope = meta.get("source_scope")
    if source_scope == "local_session":
        scope_rank = 0
    elif source_scope == "local_project":
        scope_rank = 1
    elif source_scope == "reference_base":
        scope_rank = 2
    else:
        scope_rank = 3
    priority = int(meta.get("reference_priority") or 0)
    return (scope_rank, priority, -item.score)


def _query_collection(collection, query_embedding, top_k: int, where: Optional[dict]):
    return collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        where=where,
        include=["documents", "metadatas", "distances"],
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
    collection = service._vector.get_collection_if_exists(project_id)
    if collection is None or collection.count() == 0:
        collection = None

    query_embedding = await service._embedding.embed_text(query)
    base_where = _build_where_clause(filters=filters)
    result_sets = []
    session_where = _build_where_clause(session_id=session_id, filters=filters)

    if collection is not None and session_where is not None:
        result_sets.append(
            (
                _query_collection(collection, query_embedding, top_k, session_where),
                {
                    "source_project_id": project_id,
                    "source_scope": "local_session",
                },
            )
        )
    if collection is not None:
        result_sets.append(
            (
                _query_collection(collection, query_embedding, top_k, base_where),
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
            if target_collection is None or target_collection.count() == 0:
                continue
            result_sets.append(
                (
                    _query_collection(
                        target_collection,
                        query_embedding,
                        top_k,
                        base_where,
                    ),
                    target,
                )
            )

    merged_by_chunk: dict[str, RAGResult] = {}
    for raw_result, source_info in result_sets:
        for item in _build_rag_results(raw_result, **source_info):
            existing = merged_by_chunk.get(item.chunk_id)
            if existing is None or _sort_key(item) < _sort_key(existing):
                merged_by_chunk[item.chunk_id] = item

    rag_results = sorted(merged_by_chunk.values(), key=_sort_key)[:top_k]

    if score_threshold > 0.0:
        rag_results = [r for r in rag_results if r.score >= score_threshold]
    return rag_results


async def get_chunk_detail(service, chunk_id: str, project_id: Optional[str] = None):
    if project_id:
        detail = await _get_chunk_from_collection(service, chunk_id, project_id)
        if detail is not None:
            return detail
        for target in await _list_active_reference_targets(project_id):
            detail = await _get_chunk_from_collection(
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


async def _get_chunk_from_collection(service, chunk_id: str, project_id: str):
    collection = service._vector.get_collection_if_exists(project_id)
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
    context = None
    chunk_index = meta.get("chunk_index")
    upload_id = meta.get("upload_id")
    if chunk_index is not None and upload_id:
        context = await _get_chunk_context(collection, upload_id, chunk_index)
    return SourceDetail(
        chunk_id=chunk_id,
        content=content,
        source=SourceReference(
            chunk_id=chunk_id,
            source_type=normalize_source_type(meta.get("source_type", "document")),
            filename=meta.get("filename", ""),
            page_number=meta.get("page_number"),
        ),
        context=context,
    )


async def _get_chunk_context(
    collection: Collection, upload_id: str, chunk_index: int
) -> Optional[ChunkContext]:
    prev_chunk = None
    next_chunk = None
    for offset, attr in [(-1, "prev"), (1, "next")]:
        target_idx = chunk_index + offset
        if target_idx < 0:
            continue
        try:
            result = collection.get(
                where={"$and": [{"upload_id": upload_id}, {"chunk_index": target_idx}]},
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
