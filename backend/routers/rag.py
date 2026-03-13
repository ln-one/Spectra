"""
RAG Router - 检索增强生成相关端点

实现知识库检索、来源详情、文件索引、相似内容查找、网络资源搜索、音视频处理。
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from schemas.rag import RAGIndexRequest, RAGSearchRequest, RAGSimilarRequest
from services import db_service
from services.network_resource_strategy import (
    audio_segments_to_units,
    prepare_web_knowledge_units,
    video_segments_to_units,
)
from services.rag_indexing_service import index_upload_file_for_rag
from services.rag_service import rag_service
from services.web_search_service import web_search_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/rag", tags=["RAG"])
logger = logging.getLogger(__name__)


def _build_index_metadata(unit: dict) -> dict:
    """Merge unit metadata and citation fields for stable traceability."""
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

    metadata = {k: v for k, v in metadata.items() if v is not None}
    return metadata


def _serialize_upload(upload) -> dict:
    return {
        "id": getattr(upload, "id", None),
        "filename": getattr(upload, "filename", None),
        "file_type": getattr(upload, "fileType", None),
        "mime_type": getattr(upload, "mimeType", None),
        "file_size": getattr(upload, "size", None),
        "status": getattr(upload, "status", None),
        "parse_progress": None,
        "parse_details": None,
        "parse_error": getattr(upload, "errorMessage", None),
        "usage_intent": getattr(upload, "usageIntent", None),
        "parse_result": None,
        "created_at": getattr(upload, "createdAt", None),
        "updated_at": getattr(upload, "updatedAt", None),
    }


@router.post("/search")
async def search_knowledge_base(
    request: RAGSearchRequest,
    user_id: str = Depends(get_current_user),
):
    """检索知识库"""
    try:
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
    except APIException:
        raise
    except Exception as e:
        logger.error(f"RAG search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="检索失败",
        )


@router.get("/sources/{chunk_id}")
async def get_source_detail(
    chunk_id: str,
    project_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """查看来源详情"""
    try:
        detail = await rag_service.get_chunk_detail(
            chunk_id=chunk_id, project_id=project_id
        )
        if not detail:
            raise NotFoundException(message=f"分块不存在: {chunk_id}")

        file_info = None
        try:
            parsed = await db_service.db.parsedchunk.find_unique(
                where={"id": chunk_id},
                include={"upload": True},
            )
            if parsed and parsed.upload:
                file_info = _serialize_upload(parsed.upload)
        except Exception as file_err:
            logger.warning(
                "Failed to load file info for chunk %s: %s", chunk_id, file_err
            )

        payload = detail.model_dump()
        if file_info:
            payload["file_info"] = file_info

        return success_response(data=payload, message="获取来源详情成功")
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Get source detail failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取来源详情失败",
        )


@router.post("/index")
async def index_file(
    request: RAGIndexRequest,
    user_id: str = Depends(get_current_user),
):
    """索引新文件到知识库（后台异步执行）"""
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


@router.post("/similar")
async def find_similar(
    request: RAGSimilarRequest,
    user_id: str = Depends(get_current_user),
):
    """查找相似内容"""
    try:
        results = await rag_service.search(
            project_id=request.project_id,
            query=request.text,
            top_k=request.top_k,
        )

        # 按阈值过滤
        filtered = [r for r in results if r.score >= request.threshold]

        return success_response(
            data={
                "results": [r.model_dump() for r in filtered],
                "total": len(filtered),
            },
            message="查找相似内容成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Find similar failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="查找相似内容失败",
        )


@router.post("/web-search")
async def web_search(
    query: str,
    project_id: str,
    max_results: int = 10,
    auto_index: bool = False,
    user_id: str = Depends(get_current_user),
):
    """搜索网络资源并可选自动入库

    Args:
        query: 搜索查询
        project_id: 项目 ID
        max_results: 最大结果数
        auto_index: 是否自动索引到 RAG（默认 False）
    """
    try:
        # 验证项目权限
        project = await db_service.get_project(project_id)
        if not project or project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        # 执行网络搜索
        raw_results = await web_search_service.search(
            query, max_results=max_results, search_depth="basic"
        )

        if not raw_results:
            return success_response(
                data={"results": [], "indexed": False},
                message="未找到相关网络资源",
            )

        # 使用策略层处理和过滤
        knowledge_units = prepare_web_knowledge_units(
            raw_results, query, min_quality=0.45, min_relevance=0.1, top_k=max_results
        )

        indexed_count = 0
        if auto_index and knowledge_units:
            # 将知识单元索引到 RAG
            from services.rag_service import ParsedChunkData

            chunks_to_index = [
                ParsedChunkData(
                    chunk_id=unit["chunk_id"],
                    content=unit["content"],
                    metadata=_build_index_metadata(unit),
                )
                for unit in knowledge_units
            ]

            try:
                indexed_count = await rag_service.index_chunks(
                    project_id=project_id, chunks=chunks_to_index
                )
            except Exception as idx_err:
                logger.warning("Failed to index web chunks: %s", idx_err)

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
    except Exception as e:
        logger.error(f"Web search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="网络搜索失败",
        )


@router.post("/audio-transcribe")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    project_id: str = "",
    auto_index: bool = False,
    language: str = "zh",
    user_id: str = Depends(get_current_user),
):
    """转录音频文件并可选自动入库

    Args:
        file: 音频文件
        project_id: 项目 ID
        auto_index: 是否自动索引到 RAG（默认 False）
        language: 语言代码（默认 zh）
    """
    import tempfile
    import uuid

    try:
        # 验证项目权限
        if project_id:
            project = await db_service.get_project(project_id)
            if not project or project.userId != user_id:
                raise ForbiddenException(message="无权限访问此项目")

        # 保存临时文件
        audio_id = str(uuid.uuid4())
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # 转录音频（使用现有 audio_service）
            from services.audio_service import transcribe_audio

            text, confidence, duration, capability_status = transcribe_audio(
                tmp_path, language=language
            )

            # 构造 segments（简化版，因为现有服务不返回详细 segments）
            segments = [
                {
                    "text": text,
                    "start": 0.0,
                    "end": duration,
                    "confidence": confidence,
                }
            ]

            # 使用策略层标准化
            knowledge_units = audio_segments_to_units(
                audio_id=audio_id,
                filename=file.filename or "audio",
                segments=segments,
                min_confidence=0.35,
            )

            indexed_count = 0
            if auto_index and knowledge_units and project_id:
                from services.rag_service import ParsedChunkData

                chunks_to_index = [
                    ParsedChunkData(
                        chunk_id=unit["chunk_id"],
                        content=unit["content"],
                        metadata=_build_index_metadata(unit),
                    )
                    for unit in knowledge_units
                ]

                try:
                    indexed_count = await rag_service.index_chunks(
                        project_id=project_id, chunks=chunks_to_index
                    )
                except Exception as idx_err:
                    logger.warning("Failed to index audio chunks: %s", idx_err)

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
            import os

            os.unlink(tmp_path)

    except APIException:
        raise
    except Exception as e:
        logger.error(f"Audio transcription failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"音频转录失败: {str(e)}",
        )


@router.post("/video-analyze")
async def analyze_video_endpoint(
    file: UploadFile = File(...),
    project_id: str = "",
    auto_index: bool = False,
    user_id: str = Depends(get_current_user),
):
    """分析视频文件并可选自动入库

    Args:
        file: 视频文件
        project_id: 项目 ID
        auto_index: 是否自动索引到 RAG（默认 False）
    """
    import tempfile
    import uuid

    try:
        # 验证项目权限
        if project_id:
            project = await db_service.get_project(project_id)
            if not project or project.userId != user_id:
                raise ForbiddenException(message="无权限访问此项目")

        # 保存临时文件
        video_id = str(uuid.uuid4())
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # 分析视频（使用现有 video_service）
            from services.video_service import process_video

            segments, capability_status = process_video(
                tmp_path, file.filename or "video"
            )

            # 使用策略层标准化
            knowledge_units = video_segments_to_units(
                video_id=video_id,
                filename=file.filename or "video",
                segments=segments,
                min_confidence=0.35,
            )

            indexed_count = 0
            if auto_index and knowledge_units and project_id:
                from services.rag_service import ParsedChunkData

                chunks_to_index = [
                    ParsedChunkData(
                        chunk_id=unit["chunk_id"],
                        content=unit["content"],
                        metadata=_build_index_metadata(unit),
                    )
                    for unit in knowledge_units
                ]

                try:
                    indexed_count = await rag_service.index_chunks(
                        project_id=project_id, chunks=chunks_to_index
                    )
                except Exception as idx_err:
                    logger.warning("Failed to index video chunks: %s", idx_err)

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
            import os

            os.unlink(tmp_path)

    except APIException:
        raise
    except Exception as e:
        logger.error(f"Video analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"视频分析失败: {str(e)}",
        )
