"""
Project Space Router

API endpoints for project space features:
- Versions (GET list/detail)
- Artifacts (GET list/detail, POST create, GET download)
"""

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from schemas.project_space import (
    Artifact,
    ArtifactCreate,
    ArtifactResponse,
    ArtifactsResponse,
    ProjectVersion,
    ProjectVersionResponse,
    ProjectVersionsResponse,
)
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import NotFoundException

router = APIRouter(prefix="/projects", tags=["Project Space"])
logger = logging.getLogger(__name__)

PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

COMMON_ERROR_RESPONSES = {
    401: {"description": "Unauthorized"},
    403: {"description": "Forbidden"},
    404: {"description": "Not Found"},
}


def _safe_parse_json(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(
                "Invalid JSON payload in project-space response serialization"
            )
            return None
    return None


# ============================================
# ProjectVersion Endpoints
# ============================================


@router.get(
    "/{project_id}/versions",
    response_model=ProjectVersionsResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_versions(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    获取项目版本列表

    Args:
        project_id: 项目ID
        user_id: 当前用户ID（从JWT获取）

    Returns:
        版本列表响应
    """
    try:
        # Check permission
        await project_space_service.check_project_permission(
            project_id, user_id, "can_view"
        )

        # Get versions via service
        versions = await project_space_service.get_project_versions(project_id)

        # Convert to response models
        version_models = []
        for version in versions:
            version_models.append(
                ProjectVersion(
                    id=version.id,
                    project_id=version.projectId,
                    parent_version_id=version.parentVersionId,
                    summary=version.summary,
                    change_type=version.changeType,
                    snapshot_data=_safe_parse_json(version.snapshotData),
                    created_by=version.createdBy,
                    created_at=version.createdAt,
                )
            )

        return ProjectVersionsResponse(
            success=True,
            data={"versions": version_models},
            message="获取版本列表成功",
        )

    except (NotFoundException, Exception) as e:
        logger.error(f"get_project_versions error: {e}")
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
    """
    获取项目版本详情

    Args:
        project_id: 项目ID
        version_id: 版本ID
        user_id: 当前用户ID

    Returns:
        版本详情响应
    """
    try:
        # Check permission
        await project_space_service.check_project_permission(
            project_id, user_id, "can_view"
        )

        # Get version via service
        version = await project_space_service.get_project_version(version_id)
        if not version or version.projectId != project_id:
            raise NotFoundException(
                f"Version {version_id} not found in project {project_id}"
            )

        # Convert to response model
        version_model = ProjectVersion(
            id=version.id,
            project_id=version.projectId,
            parent_version_id=version.parentVersionId,
            summary=version.summary,
            change_type=version.changeType,
            snapshot_data=_safe_parse_json(version.snapshotData),
            created_by=version.createdBy,
            created_at=version.createdAt,
        )

        return ProjectVersionResponse(
            success=True,
            data={"version": version_model},
            message="获取版本详情成功",
        )

    except (NotFoundException, Exception) as e:
        logger.error(f"get_project_version error: {e}")
        raise


# ============================================
# Artifact Endpoints
# ============================================


@router.get(
    "/{project_id}/artifacts",
    response_model=ArtifactsResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_artifacts(
    project_id: str,
    user_id: str = Depends(get_current_user),
    type: Optional[str] = Query(None, description="Artifact type filter"),
    visibility: Optional[str] = Query(None, description="Visibility filter"),
    owner_user_id: Optional[str] = Query(None, description="Owner user ID filter"),
    based_on_version_id: Optional[str] = Query(
        None, description="Based on version ID filter"
    ),
):
    """
    获取项目成果列表

    Args:
        project_id: 项目ID
        user_id: 当前用户ID
        type: 类型过滤（可选）
        visibility: 可见性过滤（可选）
        owner_user_id: 所有者过滤（可选）
        based_on_version_id: 基于版本过滤（可选）

    Returns:
        成果列表响应
    """
    try:
        # Check permission
        await project_space_service.check_project_permission(
            project_id, user_id, "can_view"
        )

        # Get artifacts with filters via service
        artifacts = await project_space_service.get_project_artifacts(
            project_id,
            type_filter=type,
            visibility_filter=visibility,
            owner_user_id_filter=owner_user_id,
            based_on_version_id_filter=based_on_version_id,
        )

        # Convert to response models
        artifact_models = []
        for artifact in artifacts:
            artifact_models.append(
                Artifact(
                    id=artifact.id,
                    project_id=artifact.projectId,
                    session_id=artifact.sessionId,
                    based_on_version_id=artifact.basedOnVersionId,
                    owner_user_id=artifact.ownerUserId,
                    type=artifact.type,
                    visibility=artifact.visibility,
                    storage_path=artifact.storagePath,
                    metadata=_safe_parse_json(artifact.metadata),
                    created_at=artifact.createdAt,
                    updated_at=artifact.updatedAt,
                )
            )

        return ArtifactsResponse(
            success=True,
            data={"artifacts": artifact_models},
            message="获取成果列表成功",
        )

    except (NotFoundException, Exception) as e:
        logger.error(f"get_project_artifacts error: {e}")
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
    """
    获取成果详情

    Args:
        project_id: 项目ID
        artifact_id: 成果ID
        user_id: 当前用户ID

    Returns:
        成果详情响应
    """
    try:
        # Check permission
        await project_space_service.check_project_permission(
            project_id, user_id, "can_view"
        )

        # Get artifact via service
        artifact = await project_space_service.get_artifact(artifact_id)
        if not artifact or artifact.projectId != project_id:
            raise NotFoundException(
                f"Artifact {artifact_id} not found in project {project_id}"
            )

        # Convert to response model
        artifact_model = Artifact(
            id=artifact.id,
            project_id=artifact.projectId,
            session_id=artifact.sessionId,
            based_on_version_id=artifact.basedOnVersionId,
            owner_user_id=artifact.ownerUserId,
            type=artifact.type,
            visibility=artifact.visibility,
            storage_path=artifact.storagePath,
            metadata=_safe_parse_json(artifact.metadata),
            created_at=artifact.createdAt,
            updated_at=artifact.updatedAt,
        )

        return ArtifactResponse(
            success=True,
            data={"artifact": artifact_model},
            message="获取成果详情成功",
        )

    except (NotFoundException, Exception) as e:
        logger.error(f"get_artifact error: {e}")
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
    """创建轻量按需成果（含文件生成）"""
    try:
        # Check permission
        await project_space_service.check_project_permission(
            project_id, user_id, "can_collaborate"
        )

        # Create artifact with file generation via service
        artifact = await project_space_service.create_artifact_with_file(
            project_id=project_id,
            artifact_type=body.type,
            visibility=body.visibility,
            user_id=user_id,
            session_id=body.session_id,
            based_on_version_id=body.based_on_version_id,
            content={"mode": body.mode},
        )

        # Convert to response model
        artifact_model = Artifact(
            id=artifact.id,
            project_id=artifact.projectId,
            session_id=artifact.sessionId,
            based_on_version_id=artifact.basedOnVersionId,
            owner_user_id=artifact.ownerUserId,
            type=artifact.type,
            visibility=artifact.visibility,
            storage_path=artifact.storagePath,
            metadata=_safe_parse_json(artifact.metadata),
            created_at=artifact.createdAt,
            updated_at=artifact.updatedAt,
        )

        logger.info(f"Created artifact {artifact.id} for project {project_id}")

        return ArtifactResponse(
            success=True,
            data={"artifact": artifact_model},
            message="创建成果成功",
        )

    except (NotFoundException, Exception) as e:
        logger.error(f"create_artifact error: {e}")
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
    """
    下载成果文件

    Args:
        project_id: 项目ID
        artifact_id: 成果ID
        user_id: 当前用户ID

    Returns:
        文件流
    """
    try:
        # Check permission
        await project_space_service.check_project_permission(
            project_id, user_id, "can_view"
        )

        # Get artifact via service
        artifact = await project_space_service.get_artifact(artifact_id)
        if not artifact or artifact.projectId != project_id:
            raise NotFoundException(
                f"Artifact {artifact_id} not found in project {project_id}"
            )

        # Check file exists
        if not artifact.storagePath:
            raise NotFoundException(f"Artifact {artifact_id} has no storage path")

        file_path = Path(artifact.storagePath)
        if not file_path.exists():
            raise NotFoundException(
                f"Artifact file not found at {artifact.storagePath}"
            )

        # Determine media type
        media_types = {
            "pptx": PPTX_MIME,
            "docx": DOCX_MIME,
            "mindmap": "application/json",
            "summary": "application/json",
            "exercise": "application/json",
            "html": "text/html",
            "gif": "image/gif",
            "mp4": "video/mp4",
        }

        media_type = media_types.get(artifact.type, "application/octet-stream")

        # Determine filename
        extension_map = {
            "pptx": "pptx",
            "docx": "docx",
            "mindmap": "json",
            "summary": "json",
            "exercise": "json",
            "html": "html",
            "gif": "gif",
            "mp4": "mp4",
        }
        ext = extension_map.get(artifact.type, "bin")
        filename = f"{artifact.type}_{artifact.id}.{ext}"

        logger.info(f"Downloading artifact {artifact_id} from {artifact.storagePath}")

        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=filename,
        )

    except (NotFoundException, Exception) as e:
        logger.error(f"download_artifact error: {e}")
        raise
