"""
RAG Router - 检索增强生成相关端点

实现知识库检索、来源详情、文件索引、相似内容查找。
"""

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from schemas.rag import (
    RAGIndexRequest,
    RAGSearchRequest,
    RAGSimilarRequest,
)
from services.rag_service import rag_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/rag", tags=["RAG"])
logger = logging.getLogger(__name__)


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

        return success_response(data=detail.model_dump(), message="获取来源详情成功")
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
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    """索引新文件到知识库（后台异步执行）"""
    import uuid

    task_id = str(uuid.uuid4())

    logger.info(
        f"Index request received for file {request.file_id}",
        extra={"user_id": user_id, "file_id": request.file_id},
    )

    # 后台执行索引任务（实际实现需要从 Prisma 查询文件内容）
    return success_response(
        data={"index_task_id": task_id, "status": "pending"},
        message="索引任务已创建",
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
