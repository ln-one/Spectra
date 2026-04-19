"""Artifact accretion helpers for project-space artifacts."""

from pathlib import Path
from typing import Any, Dict, Optional

from services.chunking import split_text
from services.file_upload_service.constants import UploadStatus
from services.library_semantics import (
    ARTIFACT_SOURCE_USAGE_INTENT,
    SILENT_ACCRETION_USAGE_INTENT,
)
from services.rag_service import ParsedChunkData, rag_service

from .artifact_content import (
    build_artifact_accretion_text,
    derive_artifact_upload_filename,
)

ARTIFACT_SOURCE_TYPE = "ai_generated"
ACCRETION_CHUNK_SIZE = 500
ACCRETION_CHUNK_OVERLAP = 50


async def silently_accrete_artifact(
    *,
    db,
    artifact,
    project_id: str,
    artifact_type: str,
    visibility: str,
    session_id: Optional[str],
    based_on_version_id: Optional[str],
    normalized_content: Dict[str, Any],
    path_cls=Path,
    rag_indexer=rag_service,
    usage_intent: str = SILENT_ACCRETION_USAGE_INTENT,
):
    if not all(
        hasattr(db, attr)
        for attr in (
            "create_upload",
            "update_file_intent",
            "update_upload_status",
            "create_parsed_chunks",
        )
    ):
        return

    text = build_artifact_accretion_text(artifact_type, normalized_content)
    if not text:
        return

    title = normalized_content.get("title")
    filename = derive_artifact_upload_filename(artifact.id, artifact_type, title)
    storage_path = getattr(artifact, "storagePath", None) or f"artifacts/{filename}"
    try:
        size = (
            path_cls(storage_path).stat().st_size
            if storage_path
            else len(text.encode())
        )
    except OSError:
        size = len(text.encode())

    upload = await db.create_upload(
        filename=filename,
        filepath=storage_path or f"artifacts/{filename}",
        size=size,
        project_id=project_id,
        file_type=artifact_type,
        mime_type="text/plain",
    )
    await db.update_file_intent(upload.id, usage_intent)

    metadata = {
        "filename": filename,
        "source_type": ARTIFACT_SOURCE_TYPE,
        "source_project_id": project_id,
        "artifact_id": artifact.id,
        "artifact_type": artifact_type,
        "artifact_visibility": visibility,
        "based_on_version_id": based_on_version_id,
        "artifact_title": str(normalized_content.get("title") or "").strip() or None,
        "source_scope": (
            "project_deposit"
            if usage_intent == ARTIFACT_SOURCE_USAGE_INTENT
            else "silent_accretion"
        ),
        "usage_intent": usage_intent,
        "accretion": (
            "project_source"
            if usage_intent == ARTIFACT_SOURCE_USAGE_INTENT
            else "silent"
        ),
    }
    if visibility == "private" and session_id:
        metadata["session_id"] = session_id

    chunks = split_text(
        text,
        chunk_size=ACCRETION_CHUNK_SIZE,
        chunk_overlap=ACCRETION_CHUNK_OVERLAP,
    ) or [text]
    chunk_payloads = [
        {
            "chunk_index": idx,
            "content": chunk,
            "metadata": dict(metadata),
        }
        for idx, chunk in enumerate(chunks)
    ]
    db_chunks = await db.create_parsed_chunks(
        upload_id=upload.id,
        source_type=ARTIFACT_SOURCE_TYPE,
        chunks=chunk_payloads,
    )
    rag_chunks = [
        ParsedChunkData(
            chunk_id=db_chunk.id,
            content=payload["content"],
            metadata=payload["metadata"]
            | {"upload_id": upload.id, "chunk_index": payload["chunk_index"]},
        )
        for db_chunk, payload in zip(db_chunks, chunk_payloads)
    ]
    indexed_count = await rag_indexer.index_chunks(project_id, rag_chunks)
    await db.update_upload_status(
        upload.id,
        status=UploadStatus.READY.value,
        parse_result={
            "chunk_count": len(chunk_payloads),
            "indexed_count": indexed_count,
            "text_length": len(text),
            "source_type": ARTIFACT_SOURCE_TYPE,
            "source_project_id": project_id,
            "artifact_id": artifact.id,
            "artifact_type": artifact_type,
            "artifact_visibility": visibility,
            "based_on_version_id": based_on_version_id,
            "artifact_title": str(normalized_content.get("title") or "").strip()
            or None,
            "usage_intent": usage_intent,
            "silent_accretion": usage_intent == SILENT_ACCRETION_USAGE_INTENT,
            "artifact_source": usage_intent == ARTIFACT_SOURCE_USAGE_INTENT,
        },
        error_message=None,
    )
    return upload
