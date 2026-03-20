import logging
import os
import tempfile
import uuid

from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool

from schemas.common import extract_source_reference_payload
from services.media.web_search import web_search_service
from services.network_resource_strategy import (
    audio_segments_to_units,
    prepare_web_knowledge_units,
    video_segments_to_units,
)
from services.rag_service import ParsedChunkData, rag_service
from utils.exceptions import ValidationException
from utils.responses import success_response

from .access import ensure_project_access

logger = logging.getLogger(__name__)
_UPLOAD_CHUNK_SIZE = 1024 * 1024


def _build_index_metadata(unit: dict) -> dict:
    metadata = dict(unit.get("metadata") or {})
    citation = unit.get("citation") or {}
    if citation:
        metadata.update(extract_source_reference_payload(citation))
    return {k: v for k, v in metadata.items() if v is not None}


async def _save_upload_to_temp_file(file: UploadFile, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        while True:
            chunk = await file.read(_UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            tmp.write(chunk)
        return tmp.name


async def cleanup_temp_file(tmp_path: str | None) -> None:
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
        indexed_count = await _index_knowledge_units(project_id, knowledge_units, "web")

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
        from services.media.audio import transcribe_audio

        text, confidence, duration, capability_status = await run_in_threadpool(
            transcribe_audio,
            tmp_path,
            language=language,
        )
        knowledge_units = audio_segments_to_units(
            audio_id=audio_id,
            filename=file.filename or "audio",
            segments=[
                {
                    "text": text,
                    "start": 0.0,
                    "end": duration,
                    "confidence": confidence,
                }
            ],
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
        from services.media.video import process_video

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
