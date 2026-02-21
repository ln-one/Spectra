import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from schemas import ProjectCreate
from services import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException
from utils.responses import success_response

router = APIRouter(prefix="/projects", tags=["Project"])
logger = logging.getLogger(__name__)


@router.post("")
async def create_project(
    project: ProjectCreate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Query(None, alias="Idempotency-Key"),
):
    """
    创建项目

    Args:
        project: 项目数据
        user_id: 当前用户ID（从认证依赖获取）
        idempotency_key: 幂等性密钥（可选）

    Returns:
        创建的项目信息

    Raises:
        HTTPException: 创建失败时抛出
    """
    try:
        # TODO: Implement idempotency check if idempotency_key is provided
        # if idempotency_key:
        #     cached_response = await check_idempotency(idempotency_key)
        #     if cached_response:
        #         return cached_response

        # TODO: Pass user_id to create_project when database service is updated
        new_project = await db_service.create_project(project)

        logger.info(
            "project_created",
            extra={"user_id": user_id, "project_id": new_project.id},
        )

        return success_response(data={"project": new_project}, message="项目创建成功")
    except APIException as e:
        logger.error(
            f"Failed to create project: {e.message}",
            extra={"user_id": user_id, "error_code": e.error_code},
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to create project: {str(e)}",
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project",
        )


@router.get("")
async def get_projects(
    user_id: str = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """
    获取项目列表（带分页）

    Args:
        user_id: 当前用户ID（从认证依赖获取）
        page: 页码
        limit: 每页数量

    Returns:
        项目列表和分页信息
    """
    try:
        # TODO: Update db_service to filter by user_id and support pagination
        # For now, return all projects (will be filtered by user_id later)
        projects = await db_service.get_all_projects()

        # TODO: Implement actual pagination
        total = len(projects)

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
    except Exception as e:
        logger.error(
            f"Failed to fetch projects: {str(e)}",
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch projects",
        )


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    获取项目详情

    Args:
        project_id: 项目ID
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        项目详情

    Raises:
        HTTPException: 项目不存在或无权限访问时抛出
    """
    try:
        # TODO: Get project from database
        # project = await db_service.get_project(project_id)

        # TODO: Check if project belongs to user
        # if project.userId != user_id:
        #     raise ForbiddenException(
        #         message="无权限访问此项目",
        #     )

        # TEMPORARY: Return mock response
        logger.warning(
            "get_project() is not fully implemented",
            extra={"user_id": user_id, "project_id": project_id},
        )

        return success_response(
            data={
                "project": {
                    "id": project_id,
                    "title": "示例项目",
                    "subject": "数学",
                    "status": "draft",
                }
            },
            message="获取项目详情成功",
        )
    except APIException as e:
        logger.error(
            f"Failed to get project: {e.message}",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "error_code": e.error_code,
            },
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to get project: {str(e)}",
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get project",
        )


@router.get("/{project_id}/files")
async def get_project_files(
    project_id: str,
    user_id: str = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码（从1开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """
    获取项目的上传文件列表（带分页）

    Args:
        project_id: 项目ID
        user_id: 当前用户ID（从认证依赖获取）
        page: 页码
        limit: 每页数量

    Returns:
        文件列表和分页信息

    Raises:
        HTTPException: 项目不存在或无权限访问时抛出
    """
    try:
        # TODO: Get project from database
        # project = await db_service.get_project(project_id)

        # TODO: Check if project belongs to user
        # if project.userId != user_id:
        #     raise ForbiddenException(
        #         message="无权限访问此项目",
        #     )

        # TODO: Get files for project with pagination
        # files = await db_service.get_project_files(
        #     project_id=project_id,
        #     page=page,
        #     limit=limit,
        # )

        logger.info(
            "project_files_fetched",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "page": page,
                "limit": limit,
            },
        )

        # TEMPORARY: Return mock response
        return success_response(
            data={"files": [], "total": 0, "page": page, "limit": limit},
            message="获取项目文件列表成功",
        )
    except APIException as e:
        logger.error(
            f"Failed to get project files: {e.message}",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "error_code": e.error_code,
            },
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to get project files: {str(e)}",
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get project files",
        )
