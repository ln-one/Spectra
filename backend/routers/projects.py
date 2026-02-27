import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from schemas import ProjectCreate
from services import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/projects", tags=["Project"])
logger = logging.getLogger(__name__)


@router.post("")
async def create_project(
    project: ProjectCreate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
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

        # Create project with user_id
        new_project = await db_service.create_project(project, user_id=user_id)

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
        projects = await db_service.get_projects_by_user(user_id, page, limit)
        total = await db_service.count_projects_by_user(user_id)

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
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")

        if project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        return success_response(data={"project": project}, message="获取项目详情成功")
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
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        files = await db_service.get_project_files(
            project_id=project_id,
            page=page,
            limit=limit,
        )
        total = await db_service.count_project_files(project_id=project_id)

        logger.info(
            "project_files_fetched",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "page": page,
                "limit": limit,
            },
        )

        return success_response(
            data={"files": files, "total": total, "page": page, "limit": limit},
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
