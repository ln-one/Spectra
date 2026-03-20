"""Artifact routes for Project Space."""

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from schemas.project_space import (
    ArtifactCreate,
    ArtifactResponse,
    ArtifactsResponse,
    ArtifactType,
    ArtifactVisibility,
    ProjectPermission,
)
from services.project_space_service import project_space_service
from services.project_space_service.artifact_semantics import (
    build_artifact_download_filename,
    get_artifact_media_type,
)
from utils.dependencies import get_current_user
from utils.exceptions import NotFoundException

from .shared import COMMON_ERROR_RESPONSES, DOCX_MIME, PPTX_MIME, to_artifact_model

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/{project_id}/artifacts",
    response_model=ArtifactsResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_artifacts(
    project_id: str,
    user_id: str = Depends(get_current_user),
    type: Optional[ArtifactType] = Query(None, description="Artifact type filter"),
    visibility: Optional[ArtifactVisibility] = Query(
        None, description="Visibility filter"
    ),
    owner_user_id: Optional[str] = Query(None, description="Owner user ID filter"),
    based_on_version_id: Optional[str] = Query(
        None, description="Based on version ID filter"
    ),
    session_id: Optional[str] = Query(None, description="Session ID filter"),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.VIEW
        )
        project = await project_space_service.db.get_project(project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        artifacts = await project_space_service.get_project_artifacts(
            project_id,
            type_filter=type.value if type else None,
            visibility_filter=visibility.value if visibility else None,
            owner_user_id_filter=owner_user_id,
            based_on_version_id_filter=based_on_version_id,
            session_id_filter=session_id,
        )
        return ArtifactsResponse(
            success=True,
            data={
                "artifacts": [
                    to_artifact_model(artifact, current_version_id=current_version_id)
                    for artifact in artifacts
                ]
            },
            message="获取成果列表成功",
        )
    except (NotFoundException, Exception) as exc:
        logger.error(f"get_project_artifacts error: {exc}")
        raise


@router.get(
    "/{project_id}/artifacts/{artifact_id}",
    response_model=ArtifactResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_artifact(
    project_id: str,
    artifact_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.VIEW
        )
        artifact = await project_space_service.get_artifact(artifact_id)
        if not artifact or artifact.projectId != project_id:
            raise NotFoundException(
                f"Artifact {artifact_id} not found in project {project_id}"
            )
        project = await project_space_service.db.get_project(project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        return ArtifactResponse(
            success=True,
            data={
                "artifact": to_artifact_model(
                    artifact, current_version_id=current_version_id
                )
            },
            message="获取成果详情成功",
        )
    except (NotFoundException, Exception) as exc:
        logger.error(f"get_artifact error: {exc}")
        raise


@router.post(
    "/{project_id}/artifacts",
    response_model=ArtifactResponse,
    responses={**COMMON_ERROR_RESPONSES, 400: {"description": "Bad Request"}},
)
async def create_artifact(
    project_id: str,
    body: ArtifactCreate,
    user_id: str = Depends(get_current_user),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.COLLABORATE
        )
        artifact = await project_space_service.create_artifact_with_file(
            project_id=project_id,
            artifact_type=body.type,
            visibility=body.visibility,
            user_id=user_id,
            session_id=body.session_id,
            based_on_version_id=body.based_on_version_id,
            content=body.content,
            artifact_mode=body.mode,
        )
        logger.info(f"Created artifact {artifact.id} for project {project_id}")
        project = await project_space_service.db.get_project(project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        return ArtifactResponse(
            success=True,
            data={
                "artifact": to_artifact_model(
                    artifact, current_version_id=current_version_id
                )
            },
            message="创建成果成功",
        )
    except (NotFoundException, Exception) as exc:
        logger.error(f"create_artifact error: {exc}")
        raise


@router.get(
    "/{project_id}/artifacts/{artifact_id}/download",
    responses={
        **COMMON_ERROR_RESPONSES,
        200: {
            "description": "Binary artifact stream",
            "content": {
                "application/octet-stream": {},
                PPTX_MIME: {},
                DOCX_MIME: {},
                "application/json": {},
                "text/html": {},
                "image/gif": {},
                "video/mp4": {},
            },
        },
    },
)
async def download_artifact(
    project_id: str,
    artifact_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.VIEW
        )
        artifact = await project_space_service.get_artifact(artifact_id)
        if not artifact or artifact.projectId != project_id:
            raise NotFoundException(
                f"Artifact {artifact_id} not found in project {project_id}"
            )
        if not artifact.storagePath:
            raise NotFoundException(f"Artifact {artifact_id} has no storage path")

        file_path = Path(artifact.storagePath)
        if not file_path.exists():
            raise NotFoundException(
                f"Artifact file not found at {artifact.storagePath}"
            )

        media_type = get_artifact_media_type(artifact.type)
        filename = build_artifact_download_filename(artifact.type, artifact.id)
        logger.info(f"Downloading artifact {artifact_id} from {artifact.storagePath}")
        return FileResponse(
            path=str(file_path), media_type=media_type, filename=filename
        )
    except (NotFoundException, Exception) as exc:
        logger.error(f"download_artifact error: {exc}")
        raise
