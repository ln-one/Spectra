"""
RAG Router - 检索增强生成相关端点

实现知识库检索、来源详情、文件索引、相似内容查找。
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from schemas.rag import RAGIndexRequest, RAGSearchRequest, RAGSimilarRequest
from services import db_service
from services.rag_indexing_service import index_upload_file_for_rag
from services.rag_service import rag_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/rag", tags=["RAG"])
logger = logging.getLogger(__name__)


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
            logger.warning("Failed to load file info for chunk %s: %s", chunk_id, file_err)

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
