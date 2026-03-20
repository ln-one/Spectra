"""Version routes for Project Space."""

import logging

from fastapi import APIRouter, Depends

from schemas.project_space import (
    ProjectPermission,
    ProjectVersionResponse,
    ProjectVersionsResponse,
)
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import NotFoundException

from .shared import COMMON_ERROR_RESPONSES, to_project_version_model

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/{project_id}/versions",
    response_model=ProjectVersionsResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_versions(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.VIEW
        )
        versions = await project_space_service.get_project_versions(project_id)
        project = await project_space_service.db.get_project(project_id)
        current_version_id = getattr(project, "currentVersionId", None)
        return ProjectVersionsResponse(
            success=True,
            data={
                "versions": [
                    to_project_version_model(
                        version,
                        current_version_id=current_version_id,
                    )
                    for version in versions
                ]
            },
            message="获取版本列表成功",
        )
    except (NotFoundException, Exception) as exc:
        logger.error(f"get_project_versions error: {exc}")
        raise


@router.get(
    "/{project_id}/versions/{version_id}",
    response_model=ProjectVersionResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_version(
    project_id: str,
    version_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.VIEW
        )
        version = await project_space_service.get_project_version(version_id)
        if not version or version.projectId != project_id:
            raise NotFoundException(
                f"Version {version_id} not found in project {project_id}"
            )
        project = await project_space_service.db.get_project(project_id)
        current_version_id = getattr(project, "currentVersionId", None)
        return ProjectVersionResponse(
            success=True,
            data={
                "version": to_project_version_model(
                    version,
                    current_version_id=current_version_id,
                )
            },
            message="获取版本详情成功",
        )
    except (NotFoundException, Exception) as exc:
        logger.error(f"get_project_version error: {exc}")
        raise
