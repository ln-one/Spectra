import logging

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
            }
            if return_details
            else 0
        )

    response = await service._client.index_chunks(
        project_id=project_id,
        chunks=[
            {
                "chunk_id": chunk.chunk_id,
                "content": chunk.content,
                "metadata": dict(chunk.metadata or {}),
            }
            for chunk in chunks
        ],
    )
    indexed_count = int(response.get("indexed_count") or 0)
    details = {"indexed_count": indexed_count}
    logger.info(
        "rag_index_chunks_completed",
        extra={
            "project_id": project_id,
            "chunk_count": len(chunks),
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
