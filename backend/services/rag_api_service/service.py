import logging
import os
import tempfile
import uuid
from typing import Optional

from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool

from schemas.rag import RAGIndexRequest, RAGSearchRequest, RAGSimilarRequest
from services import db_service
from services.file_upload_service import serialize_upload
from services.network_resource_strategy import (
    audio_segments_to_units,
    prepare_web_knowledge_units,
    video_segments_to_units,
)
from services.rag_indexing_service import index_upload_file_for_rag
from services.rag_service import ParsedChunkData, rag_service
from services.web_search_service import web_search_service
from utils.exceptions import (  # noqa: E501
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from utils.responses import success_response

logger = logging.getLogger(__name__)
_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _build_index_metadata(unit: dict) -> dict:
    metadata = dict(unit.get("metadata") or {})
    citation = dict(unit.get("citation") or {})

    if citation:
        metadata.update(
            {
                "chunk_id": citation.get("chunk_id"),
                "source_type": citation.get("source_type"),
                "filename": citation.get("filename"),
                "page_number": citation.get("page_number"),
                "timestamp": citation.get("timestamp"),
            }
        )

    return {k: v for k, v in metadata.items() if v is not None}


async def ensure_project_access(project_id: str, user_id: str):
    project = await db_service.get_project(project_id)
    if not project or project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")
    return project


async def resolve_chunk_project_and_upload(chunk_id: str):
    parsed = None
    resolved_project_id: Optional[str] = None
    try:
        parsed = await db_service.db.parsedchunk.find_unique(
            where={"id": chunk_id},
            include={"upload": True},
        )
        if parsed and parsed.upload:
            resolved_project_id = parsed.upload.projectId
    except Exception as exc:
        logger.warning(
            "Failed to resolve project for chunk %s: %s",
            chunk_id,
            exc,
        )
    return resolved_project_id, parsed


async def load_chunk_upload_info(chunk_id: str, parsed=None):
    try:
        if parsed is None:
            parsed = await db_service.db.parsedchunk.find_unique(
                where={"id": chunk_id},
                include={"upload": True},
            )
        if parsed and parsed.upload:
            return serialize_upload(parsed.upload)
    except Exception as exc:
        logger.warning(
            "Failed to load file info for chunk %s: %s",
            chunk_id,
            exc,
        )
    return None


async def search_knowledge_base_response(request: RAGSearchRequest):
    filters = None
    if request.filters:
        filters = request.filters.model_dump(exclude_none=True)

    results = await rag_service.search(
        project_id=request.project_id,
        query=request.query,
        top_k=request.top_k,
        filters=filters,
    )
    return success_response(
        data={
            "results": [r.model_dump() for r in results],
            "total": len(results),
        },
        message="检索成功",
    )


async def get_source_detail_response(chunk_id: str, project_id: Optional[str]):
    resolved_project_id = project_id
    parsed = None
    if not resolved_project_id:
        resolved = await resolve_chunk_project_and_upload(chunk_id)
        resolved_project_id, parsed = resolved

    detail = await rag_service.get_chunk_detail(
        chunk_id=chunk_id,
        project_id=resolved_project_id,
    )
    if not detail:
        raise NotFoundException(message=f"分块不存在: {chunk_id}")

    file_info = await load_chunk_upload_info(chunk_id, parsed=parsed)
    payload = detail.model_dump()
    if file_info:
        payload["file_info"] = file_info
    return success_response(data=payload, message="获取来源详情成功")


async def index_file_response(request: RAGIndexRequest, user_id: str):
    upload = await db_service.get_file(request.file_id)
    if not upload:
        raise NotFoundException(message=f"文件不存在: {request.file_id}")

    project = await db_service.get_project(upload.projectId)
    if not project or project.userId != user_id:
        raise ForbiddenException(message="无权限访问此文件")

    parse_result = await index_upload_file_for_rag(
        upload=upload,
        project_id=upload.projectId,
        chunk_size=request.chunk_size,
        chunk_overlap=request.chunk_overlap,
        reindex=True,
        db=db_service,
    )
    await db_service.update_upload_status(
        upload.id,
        status="ready",
        parse_result=parse_result,
        error_message=None,
    )
    return success_response(
        data={
            "file_id": upload.id,
            "project_id": upload.projectId,
            "status": "ready",
            "parse_result": parse_result,
        },
        message="文件索引完成",
    )


async def find_similar_response(request: RAGSimilarRequest, user_id: str):
    await ensure_project_access(request.project_id, user_id)
    results = await rag_service.search(
        project_id=request.project_id,
        query=request.text,
        top_k=request.top_k,
    )
    filtered = [r for r in results if r.score >= request.threshold]
    return success_response(
        data={
            "results": [r.model_dump() for r in filtered],
            "total": len(filtered),
        },
        message="查找相似内容成功",
    )


async def _save_upload_to_temp_file(file: UploadFile, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        while True:
            chunk = await file.read(_UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            tmp.write(chunk)
        return tmp.name


async def cleanup_temp_file(tmp_path: Optional[str]) -> None:
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)


def _build_chunks_to_index(knowledge_units):
    return [
        ParsedChunkData(
            chunk_id=unit["chunk_id"],
            content=unit["content"],
            metadata=_build_index_metadata(unit),
        )
        for unit in knowledge_units
    ]


async def _index_knowledge_units(
    project_id: str, knowledge_units, log_label: str
) -> int:
    if not knowledge_units:
        return 0
    try:
        return await rag_service.index_chunks(
            project_id=project_id,
            chunks=_build_chunks_to_index(knowledge_units),
        )
    except Exception as exc:
        logger.warning("Failed to index %s chunks: %s", log_label, exc)
        return 0


async def web_search_response(
    query: str,
    project_id: str,
    max_results: int,
    auto_index: bool,
    user_id: str,
):
    await ensure_project_access(project_id, user_id)
    raw_results = await web_search_service.search(
        query,
        max_results=max_results,
        search_depth="basic",
    )

    if not raw_results:
        return success_response(
            data={"results": [], "indexed": 0 if auto_index else None},
            message="未找到相关网络资源",
        )

    knowledge_units = prepare_web_knowledge_units(
        raw_results,
        query,
        min_quality=0.45,
        min_relevance=0.1,
        top_k=max_results,
    )
    indexed_count = 0
    if auto_index:
        indexed_count = await _index_knowledge_units(
            project_id,
            knowledge_units,
            "web",
        )

    return success_response(
        data={
            "results": knowledge_units,
            "total": len(knowledge_units),
            "indexed": indexed_count if auto_index else None,
        },
        message=f"搜索成功，找到 {len(knowledge_units)} 条结果"
        + (f"，已索引 {indexed_count} 条" if auto_index else ""),
    )


async def transcribe_audio_response(
    file: UploadFile,
    project_id: str,
    auto_index: bool,
    language: str,
    user_id: str,
):
    if auto_index and not project_id:
        raise ValidationException(message="auto_index=true 时必须提供 project_id")
    if project_id:
        await ensure_project_access(project_id, user_id)

    audio_id = str(uuid.uuid4())
    tmp_path = await _save_upload_to_temp_file(file, suffix=".wav")
    try:
        from services.audio_service import transcribe_audio

        transcription = await run_in_threadpool(
            transcribe_audio,
            tmp_path,
            language=language,
        )
        text, confidence, duration, capability_status = transcription
        segments = [
            {
                "text": text,
                "start": 0.0,
                "end": duration,
                "confidence": confidence,
            }
        ]
        knowledge_units = audio_segments_to_units(
            audio_id=audio_id,
            filename=file.filename or "audio",
            segments=segments,
            min_confidence=0.35,
        )

        indexed_count = 0
        if auto_index:
            indexed_count = await _index_knowledge_units(
                project_id, knowledge_units, "audio"
            )

        return success_response(
            data={
                "audio_id": audio_id,
                "text": text,
                "segments": knowledge_units,
                "total_segments": len(knowledge_units),
                "indexed": indexed_count if auto_index else None,
                "language": language,
                "confidence": confidence,
                "duration": duration,
                "capability_status": capability_status.model_dump(),
            },
            message=f"音频转录成功，共 {len(knowledge_units)} 个片段"
            + (f"，已索引 {indexed_count} 条" if auto_index else ""),
        )
    finally:
        await cleanup_temp_file(tmp_path)


async def analyze_video_response(
    file: UploadFile,
    project_id: str,
    auto_index: bool,
    user_id: str,
):
    if auto_index and not project_id:
        raise ValidationException(message="auto_index=true 时必须提供 project_id")
    if project_id:
        await ensure_project_access(project_id, user_id)

    video_id = str(uuid.uuid4())
    tmp_path = await _save_upload_to_temp_file(file, suffix=".mp4")
    try:
        from services.video_service import process_video

        segments, capability_status = await run_in_threadpool(
            process_video,
            tmp_path,
            file.filename or "video",
        )
        knowledge_units = video_segments_to_units(
            video_id=video_id,
            filename=file.filename or "video",
            segments=segments,
            min_confidence=0.35,
        )

        indexed_count = 0
        if auto_index:
            indexed_count = await _index_knowledge_units(
                project_id, knowledge_units, "video"
            )

        return success_response(
            data={
                "video_id": video_id,
                "segments": knowledge_units,
                "total_segments": len(knowledge_units),
                "indexed": indexed_count if auto_index else None,
                "capability_status": capability_status.model_dump(),
            },
            message=f"视频分析成功，共 {len(knowledge_units)} 个片段"
            + (f"，已索引 {indexed_count} 条" if auto_index else ""),
        )
    finally:
        await cleanup_temp_file(tmp_path)
