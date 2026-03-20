from typing import Optional

from schemas.common import normalize_source_type
from schemas.rag import ChunkContext, RAGResult, SourceDetail, SourceReference
from services.media.vector import Collection


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


def _build_rag_results(results) -> list[RAGResult]:
    rag_results = []
    if results["ids"] and results["ids"][0]:
        for i, chunk_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
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
        return []

    query_embedding = await service._embedding.embed_text(query)
    base_where = _build_where_clause(filters=filters)
    result_sets = []
    session_where = _build_where_clause(session_id=session_id, filters=filters)

    if session_where is not None:
        result_sets.append(
            collection.query(
                query_embeddings=[query_embedding],
                n_results=min(top_k, collection.count()),
                where=session_where,
                include=["documents", "metadatas", "distances"],
            )
        )
    result_sets.append(
        collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            where=base_where,
            include=["documents", "metadatas", "distances"],
        )
    )

    merged_by_chunk: dict[str, RAGResult] = {}
    for raw_result in result_sets:
        for item in _build_rag_results(raw_result):
            existing = merged_by_chunk.get(item.chunk_id)
            if existing is None or item.score > existing.score:
                merged_by_chunk[item.chunk_id] = item

    rag_results = sorted(
        merged_by_chunk.values(),
        key=lambda item: item.score,
        reverse=True,
    )[:top_k]

    if score_threshold > 0.0:
        rag_results = [r for r in rag_results if r.score >= score_threshold]
    return rag_results


async def get_chunk_detail(service, chunk_id: str, project_id: Optional[str] = None):
    if project_id:
        return await _get_chunk_from_collection(service, chunk_id, project_id)
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
