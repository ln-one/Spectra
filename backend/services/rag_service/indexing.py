import logging

logger = logging.getLogger(__name__)


async def index_chunks(service, project_id: str, chunks: list) -> int:
    if not chunks:
        return 0

    collection = service._vector.get_or_create_collection(project_id)
    texts = [c.content for c in chunks]
    ids = [c.chunk_id for c in chunks]
    metadatas = [c.metadata for c in chunks]
    embeddings = await service._embedding.embed_texts(texts)
    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )
    logger.info("Indexed %s chunks for project %s", len(chunks), project_id)
    return len(chunks)


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
