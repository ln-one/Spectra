import logging
from typing import Optional

try:
    from prisma.errors import ClientNotConnectedError
except Exception:  # pragma: no cover - prisma may be unavailable in some test envs

    class ClientNotConnectedError(Exception):
        pass


from schemas.common import normalize_source_type
from schemas.rag import ChunkContext, RAGResult, SourceDetail, SourceReference
from services.database import db_service
from services.media.vector import Collection

logger = logging.getLogger(__name__)


def build_where_clause(
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


def build_rag_results(
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


async def list_active_reference_targets(project_id: str) -> list[dict]:
    try:
        from services.project_space_service import project_space_service

        project = await db_service.get_project(project_id)
        project_owner_id = getattr(project, "userId", None) if project else None
        if not project_owner_id:
            return []
        references = await project_space_service.get_project_references(
            project_id=project_id,
            user_id=project_owner_id,
        )
    except ClientNotConnectedError:
        return []
    except Exception as exc:
        logger.warning(
            "reference target lookup failed for project %s: %s", project_id, exc
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


def sort_key(item: RAGResult) -> tuple[int, int, float]:
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


def query_collection(
    collection,
    query_embedding,
    top_k: int,
    where: Optional[dict],
    *,
    collection_size: Optional[int] = None,
):
    if collection_size is None:
        collection_size = collection.count()
    limit = min(top_k, collection_size)
    if limit <= 0:
        return None
    return collection.query(
        query_embeddings=[query_embedding],
        n_results=limit,
        where=where,
        include=["documents", "metadatas", "distances"],
    )


async def get_chunk_from_collection(service, chunk_id: str, project_id: str):
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
        context = await get_chunk_context(collection, upload_id, chunk_index)
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


async def get_chunk_context(
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
        except Exception as exc:
            logger.debug(
                "rag_chunk_context_lookup_failed: upload_id=%s chunk_index=%s error=%s",
                upload_id,
                target_idx,
                exc,
            )
    if prev_chunk or next_chunk:
        return ChunkContext(previous_chunk=prev_chunk, next_chunk=next_chunk)
    return None
