"""
Project Space Service

Business logic for project space features:
- Permission checking
- Artifact storage path generation
- Artifact creation with file generation
- Version management helpers
"""

import logging
from typing import Any, Dict, Optional

from services.artifact_generator import artifact_generator
from services.database import db_service
from utils.exceptions import ForbiddenException, NotFoundException, ValidationException

logger = logging.getLogger(__name__)


class ProjectSpaceService:
    """
    Project space business logic service.

    Handles:
    - Permission checking for project resources
    - Artifact storage path generation
    - Version creation helpers
    """

    def __init__(self):
        self.db = db_service
        logger.info("ProjectSpaceService initialized")

    async def check_project_permission(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        """
        Check if user has specific permission on project.

        Args:
            project_id: Project ID
            user_id: User ID
            permission: Permission to check
                (can_view/can_reference/can_collaborate/can_manage)

        Returns:
            True if user has permission

        Raises:
            NotFoundException: Project not found
            ForbiddenException: User doesn't have permission
        """
        # Get project
        project = await self.db.get_project(project_id)
        if not project:
            raise NotFoundException(f"Project {project_id} not found")

        # Check if user is project owner (full access)
        if project.userId == user_id:
            return True

        # For now, only owner has access
        # TODO: In next phase, check ProjectMember table for member permissions
        raise ForbiddenException(
            f"User {user_id} doesn't have {permission} permission "
            f"on project {project_id}"
        )

    async def check_project_exists(self, project_id: str) -> bool:
        """
        Check if project exists.

        Args:
            project_id: Project ID

        Returns:
            True if project exists

        Raises:
            NotFoundException: Project not found
        """
        project = await self.db.get_project(project_id)
        if not project:
            raise NotFoundException(f"Project {project_id} not found")
        return True

    async def get_artifact_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        """
        Generate storage path for artifact.

        Args:
            project_id: Project ID
            artifact_type: Artifact type
            artifact_id: Artifact ID

        Returns:
            Storage path
        """
        return artifact_generator.get_storage_path(
            project_id, artifact_type, artifact_id
        )

    async def create_artifact_with_file(
        self,
        project_id: str,
        artifact_type: str,
        visibility: str,
        user_id: str,
        session_id: Optional[str] = None,
        based_on_version_id: Optional[str] = None,
        content: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Create artifact with actual file generation.

        Args:
            project_id: Project ID
            artifact_type: Artifact type
            visibility: Visibility setting
            user_id: Owner user ID
            session_id: Optional session ID
            based_on_version_id: Optional version ID
            content: Content for file generation

        Returns:
            Created artifact record
        """
        import uuid

        artifact_type = (
            artifact_type.value
            if hasattr(artifact_type, "value")
            else str(artifact_type)
        )
        artifact_id = str(uuid.uuid4())
        storage_path = artifact_generator.get_storage_path(
            project_id, artifact_type, artifact_id
        )

        if based_on_version_id:
            version = await self.db.get_project_version(based_on_version_id)
            if not version or version.projectId != project_id:
                raise ValidationException(
                    f"based_on_version_id {based_on_version_id} 不存在或不属于项目 {project_id}"
                )

        # Generate actual file based on type
        if content is None:
            content = self._default_artifact_content(artifact_type)

        # Check if type is supported for file generation
        supported_types = [
            "pptx",
            "docx",
            "mindmap",
            "summary",
            "exercise",
            "html",
            "gif",
            "mp4",
        ]
        if artifact_type not in supported_types:
            raise ValidationException(
                f"Artifact type '{artifact_type}' file generation not yet supported. "
                f"Supported types: {', '.join(supported_types)}"
            )

        try:
            if artifact_type == "pptx":
                actual_path = await artifact_generator.generate_pptx(
                    content, project_id, artifact_id
                )
            elif artifact_type == "docx":
                actual_path = await artifact_generator.generate_docx(
                    content, project_id, artifact_id
                )
            elif artifact_type == "mindmap":
                actual_path = await artifact_generator.generate_mindmap(
                    content, project_id, artifact_id
                )
            elif artifact_type == "summary":
                actual_path = await artifact_generator.generate_summary(
                    content, project_id, artifact_id
                )
            elif artifact_type == "exercise":
                actual_path = await artifact_generator.generate_quiz(
                    content, project_id, artifact_id
                )
            elif artifact_type == "html":
                html_content = content.get("html", "<html><body>Empty</body></html>")
                actual_path = await artifact_generator.generate_html(
                    html_content, project_id, artifact_id
                )
            elif artifact_type == "gif":
                actual_path = await artifact_generator.generate_animation(
                    content, project_id, artifact_id
                )
            elif artifact_type == "mp4":
                actual_path = await artifact_generator.generate_video_placeholder(
                    project_id, artifact_id
                )

            # Use actual generated path
            storage_path = actual_path
        except Exception as e:
            logger.error(f"Failed to generate artifact file: {e}")
            raise

        # Create artifact record in database
        artifact = await self.db.create_artifact(
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            owner_user_id=user_id,
            storage_path=storage_path,
            metadata={"created_by": user_id},
        )
        return artifact

    @staticmethod
    def _default_artifact_content(artifact_type: str) -> Dict[str, Any]:
        if artifact_type == "pptx":
            return {"title": "课件演示文稿", "slides": []}
        if artifact_type == "docx":
            return {"title": "教学讲义", "sections": []}
        if artifact_type == "mindmap":
            return {"title": "思维导图", "nodes": []}
        if artifact_type == "summary":
            return {"title": "课程总结", "summary": "", "key_points": []}
        if artifact_type == "exercise":
            return {"title": "练习题", "questions": []}
        if artifact_type == "html":
            return {"html": "<html><body>Empty</body></html>"}
        if artifact_type == "gif":
            return {"title": "动画占位图", "scenes": []}
        if artifact_type == "mp4":
            return {"title": "视频占位文件"}
        return {"title": f"{artifact_type} artifact", "data": []}

    async def get_project_versions(self, project_id: str):
        """Get project versions."""
        return await self.db.get_project_versions(project_id)

    async def get_project_version(self, version_id: str):
        """Get specific project version."""
        return await self.db.get_project_version(version_id)

    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
    ):
        """Get project artifacts with filters."""
        return await self.db.get_project_artifacts(
            project_id,
            type_filter,
            visibility_filter,
            owner_user_id_filter,
            based_on_version_id_filter,
        )

    async def get_artifact(self, artifact_id: str):
        """Get specific artifact."""
        return await self.db.get_artifact(artifact_id)


# Global project space service instance
project_space_service = ProjectSpaceService()
