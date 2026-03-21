import logging
import time

logger = logging.getLogger(__name__)


async def index_chunks(
    service,
    project_id: str,
    chunks: list,
    *,
    return_details: bool = False,
):
    if not chunks:
        return (
            {
                "indexed_count": 0,
                "embedding_ms": 0.0,
                "vector_upsert_ms": 0.0,
                "index_ms": 0.0,
            }
            if return_details
            else 0
        )

    started_at = time.perf_counter()
    collection = service._vector.get_or_create_collection(project_id)
    texts = [c.content for c in chunks]
    ids = [c.chunk_id for c in chunks]
    metadatas = [c.metadata for c in chunks]
    embedding_started_at = time.perf_counter()
    embeddings = await service._embedding.embed_texts(texts)
    embedding_ms = round((time.perf_counter() - embedding_started_at) * 1000, 2)
    upsert_started_at = time.perf_counter()
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )
    vector_upsert_ms = round((time.perf_counter() - upsert_started_at) * 1000, 2)
    index_ms = round((time.perf_counter() - started_at) * 1000, 2)
    details = {
        "indexed_count": len(chunks),
        "embedding_ms": embedding_ms,
        "vector_upsert_ms": vector_upsert_ms,
        "index_ms": index_ms,
    }
    logger.info(
        "rag_index_chunks_completed",
        extra={
            "project_id": project_id,
            "chunk_count": len(chunks),
            **details,
        },
    )
    return details if return_details else len(chunks)


async def delete_project_index(service, project_id: str) -> bool:
    return service._vector.delete_collection(project_id)


async def delete_upload_index(service, project_id: str, upload_id: str) -> int:
    collection = service._vector.get_collection_if_exists(project_id)
    if collection is None:
        return 0
    try:
        existing = collection.get(where={"upload_id": upload_id}, include=[])
        count = len(existing.get("ids", []))
        if count > 0:
            collection.delete(where={"upload_id": upload_id})
        return count
    except Exception:
        logger.warning(
            "Failed to delete upload index",
            extra={"project_id": project_id, "upload_id": upload_id},
            exc_info=True,
        )
        return 0
