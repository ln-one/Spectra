import asyncio
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query

from schemas import ProjectCreate
from services.application.project_api import create_project_response
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, InternalServerException
from utils.responses import success_response

from .shared import logger

router = APIRouter()


@router.post("")
async def create_project(
    project: ProjectCreate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """创建项目。"""
    try:
        key_str = str(idempotency_key) if idempotency_key else None
        return await create_project_response(project, user_id, key_str)
    except APIException as exc:
        logger.error(
            "Failed to create project: %s",
            exc.message,
            extra={"user_id": user_id, "error_code": exc.error_code},
        )
        raise
    except Exception as exc:
        logger.error(
            "Failed to create project: %s",
            exc,
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise InternalServerException(
            message="创建项目失败",
        )


@router.get("/search")
async def search_projects(
    q: str = Query(..., description="搜索关键词"),
    project_status: Optional[str] = Query(
        None, alias="status", description="按状态筛选"
    ),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    user_id: str = Depends(get_current_user),
):
    """按关键字搜索项目。"""
    try:
        projects, total = await asyncio.gather(
            db_service.search_projects(
                user_id=user_id,
                q=q,
                status=project_status,
                page=page,
                limit=limit,
            ),
            db_service.count_search_projects(
                user_id=user_id, q=q, status=project_status
            ),
        )
        logger.info(
            "projects_searched",
            extra={"user_id": user_id, "q": q, "total": total},
        )
        return success_response(
            data={"projects": projects, "total": total, "page": page, "limit": limit},
            message="搜索项目成功",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to search projects: %s",
            exc,
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise InternalServerException(
            message="搜索项目失败",
            details={
                "query": q,
                "status": project_status,
                "page": page,
                "limit": limit,
            },
        )


@router.get("")
async def get_projects(
    user_id: str = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取项目列表（分页）。"""
    try:
        projects, total = await asyncio.gather(
            db_service.get_projects_by_user(user_id, page, limit),
            db_service.count_projects_by_user(user_id),
        )

        logger.info(
            "projects_fetched",
            extra={"user_id": user_id, "page": page, "limit": limit, "total": total},
        )

        return success_response(
            data={
                "projects": projects,
                "total": total,
                "page": page,
                "limit": limit,
            },
            message="获取项目列表成功",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to fetch projects: %s",
            exc,
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise InternalServerException(
            message="获取项目列表失败",
            details={"page": page, "limit": limit},
        )
