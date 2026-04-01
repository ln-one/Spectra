"""
RAG Indexing Service

统一处理上传文件的解析、分块、入库和向量索引，避免多处逻辑漂移。
"""

import logging
import time
from typing import Any, Optional

from schemas.common import normalize_source_type
from services.chunking import split_text
from services.database import db_service
from services.file_parser import extract_text_for_rag
from services.rag_service import ParsedChunkData, rag_service

logger = logging.getLogger(__name__)


def _sanitize_text_for_postgres(value: str) -> str:
    # PostgreSQL text/varchar cannot store NUL bytes.
    return str(value or "").replace("\x00", "")


async def index_upload_file_for_rag(
    upload: Any,
    project_id: str,
    session_id: Optional[str] = None,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    reindex: bool = False,
    db=None,
    preparsed_text: Optional[str] = None,
    preparsed_details: Optional[dict[str, Any]] = None,
    provider_override: Optional[str] = None,
) -> dict:
    """
    解析并索引单个上传文件，返回索引摘要。

    Args:
        upload: Upload 记录对象
        project_id: 所属项目 ID
        chunk_size: 分块大小
        chunk_overlap: 重叠大小
        reindex: 是否先删除该文件已有索引
    """
    stage_timings_ms: dict[str, float] = {}
    provider = "unknown"
    fallback_used = False

    if preparsed_text is not None:
        text = str(preparsed_text)
        parse_details = dict(preparsed_details or {})
        if provider_override:
            parse_details["provider_used"] = provider_override
        parse_details["parse_mode"] = "remote_preparsed"
        stage_timings_ms["parse_ms"] = 0.0
    else:
        try:
            parse_started_at = time.perf_counter()
            text, parse_details = extract_text_for_rag(
                filepath=upload.filepath,
                filename=upload.filename,
                file_type=upload.fileType,
            )
            stage_timings_ms["parse_ms"] = round(
                (time.perf_counter() - parse_started_at) * 1000,
                2,
            )
        except Exception as exc:
            logger.warning(
                "file_parse_failed: upload_id=%s filename=%s error=%s",
                upload.id,
                upload.filename,
                exc,
                exc_info=True,
            )
            text = ""
            parse_details = {"error": str(exc)}
            stage_timings_ms["parse_ms"] = 0.0

    capability_status = parse_details.get("capability_status") or {}
    provider = str(
        provider_override
        or parse_details.get("provider_used")
        or capability_status.get("provider")
        or "unknown"
    )
    fallback_used = bool(parse_details.get("fallback")) or bool(
        capability_status.get("fallback_chain")
    )

    text = _sanitize_text_for_postgres(text)
    if not text.strip():
        logger.info(
            "empty_text_fallback: upload_id=%s filename=%s",
            upload.id,
            upload.filename,
        )
        text = _sanitize_text_for_postgres(
            (
                f"资料名称：{upload.filename}\n"
                f"资料类型：{upload.fileType}\n"
                "该资料可作为课堂讲解与课件生成的参考来源。"
            )
        )
        parse_details["text_length"] = len(text)
        parse_details["fallback"] = True
        fallback_used = True

    chunk_started_at = time.perf_counter()
    chunks = split_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks = [_sanitize_text_for_postgres(chunk) for chunk in chunks]
    chunks = [chunk for chunk in chunks if chunk.strip()]
    if not chunks:
        chunks = [text]
    stage_timings_ms["chunk_ms"] = round(
        (time.perf_counter() - chunk_started_at) * 1000,
        2,
    )

    db = db or db_service

    if reindex:
        logger.info(
            "reindex_requested: upload_id=%s project_id=%s",
            upload.id,
            project_id,
        )
        await rag_service.delete_upload_index(
            project_id=project_id, upload_id=upload.id
        )
        await db.delete_parsed_chunks(upload.id)

    normalize_started_at = time.perf_counter()
    normalized_source_type = normalize_source_type(upload.fileType).value
    base_metadata = {
        "filename": upload.filename,
        "source_type": normalized_source_type,
    }
    if session_id:
        base_metadata["session_id"] = session_id

    chunk_payloads = [
        {
            "chunk_index": idx,
            "content": chunk,
            "metadata": dict(base_metadata),
        }
        for idx, chunk in enumerate(chunks)
    ]
    stage_timings_ms["normalize_ms"] = round(
        (time.perf_counter() - normalize_started_at) * 1000,
        2,
    )

    db_chunks = await db.create_parsed_chunks(
        upload_id=upload.id,
        source_type=upload.fileType,
        chunks=chunk_payloads,
    )

    rag_chunks = []
    for db_chunk, payload in zip(db_chunks, chunk_payloads):
        metadata = payload["metadata"] | {
            "upload_id": upload.id,
            "chunk_index": payload["chunk_index"],
        }
        rag_chunks.append(
            ParsedChunkData(
                chunk_id=db_chunk.id,
                content=payload["content"],
                metadata=metadata,
            )
        )

    index_details = await rag_service.index_chunks(
        project_id,
        rag_chunks,
        return_details=True,
    )
    if isinstance(index_details, dict):
        indexed_count = int(index_details.get("indexed_count") or 0)
        stage_timings_ms["embedding_ms"] = round(
            float(index_details.get("embedding_ms") or 0.0),
            2,
        )
        stage_timings_ms["index_ms"] = round(
            float(index_details.get("index_ms") or 0.0),
            2,
        )
    else:
        indexed_count = int(index_details or 0)
        stage_timings_ms["embedding_ms"] = 0.0
        stage_timings_ms["index_ms"] = 0.0

    result = {
        "chunk_count": len(chunks),
        "indexed_count": indexed_count,
        "provider": provider,
        "fallback_used": fallback_used,
        "stage_timings_ms": stage_timings_ms,
        **parse_details,
    }
    logger.info(
        "rag_upload_index_complete",
        extra={
            "upload_id": upload.id,
            "project_id": project_id,
            "file_type": upload.fileType,
            "provider": provider,
            "fallback_used": fallback_used,
            "chunk_count": len(chunks),
            "indexed_count": indexed_count,
            **stage_timings_ms,
        },
    )
    return result
