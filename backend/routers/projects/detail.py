from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from schemas import ProjectUpdate
from services.application.project_api import (
    get_owned_project,
    get_project_files_response,
    update_project_response,
)
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException
from utils.responses import success_response

from .shared import logger

router = APIRouter()


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    """获取项目详情。"""
    try:
        project = await get_owned_project(project_id, user_id)
        return success_response(data={"project": project}, message="获取项目详情成功")
    except APIException as exc:
        logger.error(
            "Failed to get project: %s",
            exc.message,
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "error_code": exc.error_code,
            },
        )
        raise
    except Exception as exc:
        logger.error(
            "Failed to get project: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取项目详情失败",
        )


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """修改项目信息。"""
    try:
        key_str = str(idempotency_key) if idempotency_key else None
        return await update_project_response(project_id, body, user_id, key_str)
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to update project: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新项目失败",
        )


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    """删除项目。"""
    try:
        await get_owned_project(project_id, user_id)
        await db_service.delete_project(project_id)
        logger.info(
            "project_deleted",
            extra={"user_id": user_id, "project_id": project_id},
        )
        return success_response(data={}, message="项目删除成功")
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to delete project: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除项目失败",
        )


@router.get("/{project_id}/statistics")
async def get_project_statistics(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    """获取项目统计信息。"""
    try:
        await get_owned_project(project_id, user_id)
        stats = await db_service.get_project_statistics(project_id)
        return success_response(data=stats, message="获取项目统计成功")
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to get project statistics: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取统计信息失败",
        )


@router.get("/{project_id}/files")
async def get_project_files(
    project_id: str,
    user_id: str = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取项目的上传文件列表（分页）。"""
    try:
        return await get_project_files_response(project_id, user_id, page, limit)
    except APIException as exc:
        logger.error(
            "Failed to get project files: %s",
            exc.message,
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "error_code": exc.error_code,
            },
        )
        raise
    except Exception as exc:
        logger.error(
            "Failed to get project files: %s",
            exc,
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取项目文件列表失败",
        )
