"""
RAG Indexing Service

统一处理上传文件的解析、分块、入库和向量索引，避免多处逻辑漂移。
"""

import logging
from typing import Any, Optional

from schemas.common import normalize_source_type
from services.chunking import split_text
from services.database import db_service
from services.file_parser import extract_text_for_rag
from services.rag_service import ParsedChunkData, rag_service

logger = logging.getLogger(__name__)


async def index_upload_file_for_rag(
    upload: Any,
    project_id: str,
    session_id: Optional[str] = None,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    reindex: bool = False,
    db=None,
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
    try:
        text, parse_details = extract_text_for_rag(
            filepath=upload.filepath,
            filename=upload.filename,
            file_type=upload.fileType,
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

    if not text.strip():
        logger.info(
            "empty_text_fallback: upload_id=%s filename=%s",
            upload.id,
            upload.filename,
        )
        text = (
            f"资料名称：{upload.filename}\n"
            f"资料类型：{upload.fileType}\n"
            "该资料可作为课堂讲解与课件生成的参考来源。"
        )
        parse_details["text_length"] = len(text)
        parse_details["fallback"] = True

    chunks = split_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    if not chunks:
        chunks = [text]

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

    indexed_count = await rag_service.index_chunks(project_id, rag_chunks)

    result = {
        "chunk_count": len(chunks),
        "indexed_count": indexed_count,
        **parse_details,
    }
    logger.info(
        "index_complete: upload_id=%s chunks=%d indexed=%d",
        upload.id,
        len(chunks),
        indexed_count,
    )
    return result
