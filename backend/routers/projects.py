import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from schemas import ProjectCreate
from schemas.courses import ProjectUpdate
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
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
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
        # 幂等性检查
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = f"projects:create:{user_id}:{key_str}" if key_str else None
        if cache_key:
            cached_response = await db_service.get_idempotency_response(cache_key)
            if cached_response:
                logger.info(
                    "idempotency_cache_hit",
                    extra={"user_id": user_id, "idempotency_key": key_str},
                )
                return cached_response

        # Create project with user_id
        new_project = await db_service.create_project(project, user_id=user_id)

        logger.info(
            "project_created",
            extra={"user_id": user_id, "project_id": new_project.id},
        )

        response_payload = success_response(
            data={"project": new_project}, message="项目创建成功"
        )

        # 保存幂等性响应
        if cache_key:
            from fastapi.encoders import jsonable_encoder

            await db_service.save_idempotency_response(
                cache_key, jsonable_encoder(response_payload)
            )

        return response_payload
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
    """搜索项目（按关键词匹配名称或描述）"""
    try:
        projects = await db_service.search_projects(
            user_id=user_id,
            q=q,
            status=project_status,
            page=page,
            limit=limit,
        )
        total = await db_service.count_search_projects(
            user_id=user_id, q=q, status=project_status
        )
        logger.info(
            "projects_searched",
            extra={"user_id": user_id, "q": q, "total": total},
        )
        return success_response(
            data={"projects": projects, "total": total, "page": page, "limit": limit},
            message="搜索项目成功",
        )
    except Exception as e:
        logger.error(
            f"Failed to search projects: {e}", extra={"user_id": user_id}, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="搜索项目失败",
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


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """修改项目信息"""
    try:
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限修改此项目")

        updated = await db_service.update_project(
            project_id=project_id,
            name=body.name,
            description=body.description,
            grade_level=body.grade_level,
        )
        logger.info(
            "project_updated",
            extra={"user_id": user_id, "project_id": project_id},
        )
        return success_response(data={"project": updated}, message="项目更新成功")
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to update project: {e}",
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
    """删除项目"""
    try:
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限删除此项目")

        await db_service.delete_project(project_id)
        logger.info(
            "project_deleted",
            extra={"user_id": user_id, "project_id": project_id},
        )
        return success_response(data={}, message="项目删除成功")
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to delete project: {e}",
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
    """获取项目统计信息"""
    try:
        project = await db_service.get_project(project_id)
        if not project:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        if project.userId != user_id:
            raise ForbiddenException(message="无权限访问此项目")

        stats = await db_service.get_project_statistics(project_id)
        return success_response(data=stats, message="获取项目统计成功")
    except APIException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to get project statistics: {e}",
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
