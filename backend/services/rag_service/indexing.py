import logging
import os

logger = logging.getLogger(__name__)


def _index_batch_size() -> int:
    raw = os.getenv("STRATUMIND_INDEX_BATCH_SIZE", "").strip()
    if not raw:
        return 64
    try:
        return max(1, int(raw))
    except ValueError:
        return 64


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
            }
            if return_details
            else 0
        )

    batch_size = _index_batch_size()
    indexed_count = 0
    details = {
        "indexed_count": 0,
        "embedding_ms": 0.0,
        "index_ms": 0.0,
        "batch_count": 0,
    }
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        response = await service._client.index_chunks(
            project_id=project_id,
            chunks=[
                {
                    "chunk_id": chunk.chunk_id,
                    "content": chunk.content,
                    "metadata": dict(chunk.metadata or {}),
                }
                for chunk in batch
            ],
        )
        indexed_count += int(response.get("indexed_count") or 0)
        details["embedding_ms"] += float(response.get("embedding_ms") or 0.0)
        details["index_ms"] += float(response.get("index_ms") or 0.0)
        details["batch_count"] += 1
    details["indexed_count"] = indexed_count
    logger.info(
        "rag_index_chunks_completed",
        extra={
            "project_id": project_id,
            "chunk_count": len(chunks),
            "batch_size": batch_size,
            **details,
        },
    )
    return details if return_details else indexed_count


async def delete_project_index(service, project_id: str) -> bool:
    await service._client.delete_project_index(project_id=project_id)
    return True


async def delete_upload_index(service, project_id: str, upload_id: str) -> int:
    await service._client.delete_upload_index(
        project_id=project_id, upload_id=upload_id
    )
    return 0
