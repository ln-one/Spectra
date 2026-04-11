"""Version routes for Project Space."""

import logging

from fastapi import APIRouter, Depends

from schemas.project_space import (
    ProjectPermission,
    ProjectVersionResponse,
    ProjectVersionsResponse,
)
from services.project_space_service.service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import ConflictException, NotFoundException

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
        versions, current_version_id = (
            await project_space_service.get_project_versions_with_context(project_id)
        )
        return ProjectVersionsResponse(
            versions=[to_project_version_model(version) for version in versions],
            currentVersionId=current_version_id,
        )
    except (ConflictException, NotFoundException, Exception) as exc:
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
        version, _current_version_id = (
            await project_space_service.get_project_version_with_context(
                project_id, version_id
            )
        )
        return ProjectVersionResponse(version=to_project_version_model(version))
    except (ConflictException, NotFoundException, Exception) as exc:
        logger.error(f"get_project_version error: {exc}")
        raise
