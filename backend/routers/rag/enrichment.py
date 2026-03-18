import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from services.network_resource_strategy import (
    audio_segments_to_units,
    prepare_web_knowledge_units,
    video_segments_to_units,
)
from services.rag_service import rag_service
from services.web_search_service import web_search_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ValidationException
from utils.responses import success_response

from .shared import (
    _build_index_metadata,
    _save_upload_to_temp_file,
    cleanup_temp_file,
    ensure_project_access,
    handle_rag_error,
    logger,
)

router = APIRouter()


def _build_chunks_to_index(knowledge_units):
    from services.rag_service import ParsedChunkData

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
    except Exception as idx_err:
        logger.warning("Failed to index %s chunks: %s", log_label, idx_err)
        return 0


@router.post("/web-search")
async def web_search(
    query: str = Query(..., min_length=1),
    project_id: str = Query(..., min_length=1),
    max_results: int = Query(10, ge=1, le=20),
    auto_index: bool = Query(False),
    user_id: str = Depends(get_current_user),
):
    """搜索网络资源并可选自动入库"""
    try:
        await ensure_project_access(project_id, user_id)
        raw_results = await web_search_service.search(
            query, max_results=max_results, search_depth="basic"
        )

        if not raw_results:
            return success_response(
                data={"results": [], "indexed": 0 if auto_index else None},
                message="未找到相关网络资源",
            )

        knowledge_units = prepare_web_knowledge_units(
            raw_results, query, min_quality=0.45, min_relevance=0.1, top_k=max_results
        )
        indexed_count = 0
        if auto_index:
            indexed_count = await _index_knowledge_units(
                project_id, knowledge_units, "web"
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
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error("网络搜索失败", exc)


@router.post("/audio-transcribe")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    project_id: str = Form(""),
    auto_index: bool = Form(False),
    language: str = Form("zh"),
    user_id: str = Depends(get_current_user),
):
    """转录音频文件并可选自动入库"""
    try:
        if auto_index and not project_id:
            raise ValidationException(message="auto_index=true 时必须提供 project_id")
        if project_id:
            await ensure_project_access(project_id, user_id)

        audio_id = str(uuid.uuid4())
        tmp_path = await _save_upload_to_temp_file(file, suffix=".wav")
        try:
            from services.audio_service import transcribe_audio

            text, confidence, duration, capability_status = await run_in_threadpool(
                transcribe_audio,
                tmp_path,
                language=language,
            )
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
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error(f"音频转录失败: {str(exc)}", exc)


@router.post("/video-analyze")
async def analyze_video_endpoint(
    file: UploadFile = File(...),
    project_id: str = Form(""),
    auto_index: bool = Form(False),
    user_id: str = Depends(get_current_user),
):
    """分析视频文件并可选自动入库"""
    try:
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
    except APIException:
        raise
    except Exception as exc:
        raise handle_rag_error(f"视频分析失败: {str(exc)}", exc)
