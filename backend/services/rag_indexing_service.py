"""
RAG Indexing Service

统一处理上传文件的解析、分块、入库和向量索引，避免多处逻辑漂移。
"""

from typing import Any

from services.chunking import split_text
from services.database import db_service
from services.file_parser import extract_text_for_rag
from services.rag_service import ParsedChunkData, rag_service


async def index_upload_file_for_rag(
    upload: Any,
    project_id: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    reindex: bool = False,
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
    text, parse_details = extract_text_for_rag(
        filepath=upload.filepath,
        filename=upload.filename,
        file_type=upload.fileType,
    )
    if not text.strip():
        text = (
            f"资料名称：{upload.filename}\n"
            f"资料类型：{upload.fileType}\n"
            "该资料可作为课堂讲解与课件生成的参考来源。"
        )
        parse_details["text_length"] = len(text)

    chunks = split_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    if not chunks:
        chunks = [text]

    if reindex:
        await rag_service.delete_upload_index(
            project_id=project_id, upload_id=upload.id
        )
        await db_service.delete_parsed_chunks(upload.id)

    chunk_payloads = [
        {
            "chunk_index": idx,
            "content": chunk,
            "metadata": {
                "filename": upload.filename,
                "source_type": upload.fileType,
            },
        }
        for idx, chunk in enumerate(chunks)
    ]

    db_chunks = await db_service.create_parsed_chunks(
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
    return {
        "chunk_count": len(chunks),
        "indexed_count": indexed_count,
        **parse_details,
    }
