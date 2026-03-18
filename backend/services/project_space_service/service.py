"""Project Space service orchestrator."""

import json
import logging
from typing import Optional

from services.database import db_service
from utils.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)

from .artifacts import create_artifact_with_file, get_artifact_storage_path
from .reference_validation import check_dag_cycle, validate_reference_creation
from .review import review_candidate_change

logger = logging.getLogger(__name__)


class ProjectSpaceService:
    """Business logic service for project space features."""

    def __init__(self):
        self.db = db_service
        logger.info("ProjectSpaceService initialized")

    async def check_project_permission(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        project = await self.db.get_project(project_id)
        if not project:
            raise NotFoundException(f"Project {project_id} not found")

        if project.userId == user_id:
            return True

        member = await self.db.get_project_member_by_user(project_id, user_id)
        if member:
            permissions = member.permissions
            if isinstance(permissions, str):
                try:
                    permissions = json.loads(permissions) if permissions else {}
                except json.JSONDecodeError:
                    permissions = {}
            if isinstance(permissions, dict) and permissions.get(permission, False):
                return True

        raise ForbiddenException(
            "User "
            f"{user_id} doesn't have {permission} permission on project {project_id}"
        )

    async def check_project_exists(self, project_id: str) -> bool:
        project = await self.db.get_project(project_id)
        if not project:
            raise NotFoundException(f"Project {project_id} not found")
        return True

    async def get_artifact_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        return await get_artifact_storage_path(project_id, artifact_type, artifact_id)

    async def create_artifact_with_file(
        self,
        project_id: str,
        artifact_type: str,
        visibility: str,
        user_id: str,
        session_id: Optional[str] = None,
        based_on_version_id: Optional[str] = None,
        content: Optional[dict] = None,
    ):
        return await create_artifact_with_file(
            db=self.db,
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            user_id=user_id,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            content=content,
        )

    async def get_project_versions(self, project_id: str):
        return await self.db.get_project_versions(project_id)

    async def get_project_version(self, version_id: str):
        return await self.db.get_project_version(version_id)

    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
    ):
        return await self.db.get_project_artifacts(
            project_id,
            type_filter,
            visibility_filter,
            owner_user_id_filter,
            based_on_version_id_filter,
        )

    async def get_artifact(self, artifact_id: str):
        return await self.db.get_artifact(artifact_id)

    async def create_project_reference(
        self,
        project_id: str,
        user_id: str,
        target_project_id: str,
        relation_type: str,
        mode: str,
        pinned_version_id: Optional[str] = None,
        priority: int = 0,
    ):
        await self.check_project_permission(project_id, user_id, "can_manage")
        await self.validate_reference_creation(
            project_id=project_id,
            target_project_id=target_project_id,
            relation_type=relation_type,
            mode=mode,
            pinned_version_id=pinned_version_id,
        )
        return await self.db.create_project_reference(
            project_id=project_id,
            target_project_id=target_project_id,
            relation_type=relation_type,
            mode=mode,
            pinned_version_id=pinned_version_id,
            priority=priority,
            created_by=user_id,
        )

    async def get_project_references(self, project_id: str, user_id: str):
        await self.check_project_permission(project_id, user_id, "can_view")
        return await self.db.get_project_references(project_id)

    async def update_project_reference(
        self,
        project_id: str,
        reference_id: str,
        user_id: str,
        mode: Optional[str] = None,
        pinned_version_id: Optional[str] = None,
        priority: Optional[int] = None,
        status: Optional[str] = None,
    ):
        await self.check_project_permission(project_id, user_id, "can_manage")

        reference = await self.db.get_project_reference(reference_id)
        if not reference or reference.projectId != project_id:
            raise NotFoundException(
                f"Reference {reference_id} not found in project {project_id}"
            )

        if mode == "pinned" and not pinned_version_id:
            raise ValidationException("mode=pinned requires pinned_version_id")

        if pinned_version_id:
            version = await self.db.get_project_version(pinned_version_id)
            if not version or version.projectId != reference.targetProjectId:
                raise ValidationException(
                    f"pinned_version_id {pinned_version_id} does not belong to "
                    f"target project {reference.targetProjectId}"
                )

        return await self.db.update_project_reference(
            reference_id=reference_id,
            mode=mode,
            pinned_version_id=pinned_version_id,
            priority=priority,
            status=status,
        )

    async def delete_project_reference(
        self,
        project_id: str,
        reference_id: str,
        user_id: str,
    ):
        await self.check_project_permission(project_id, user_id, "can_manage")
        reference = await self.db.get_project_reference(reference_id)
        if not reference or reference.projectId != project_id:
            raise NotFoundException(
                f"Reference {reference_id} not found in project {project_id}"
            )
        return await self.db.delete_project_reference(reference_id)

    async def create_candidate_change(
        self,
        project_id: str,
        user_id: str,
        title: str,
        summary: Optional[str] = None,
        payload: Optional[dict] = None,
        session_id: Optional[str] = None,
        base_version_id: Optional[str] = None,
    ):
        await self.check_project_permission(project_id, user_id, "can_collaborate")
        if base_version_id:
            base_version = await self.db.get_project_version(base_version_id)
            if not base_version or base_version.projectId != project_id:
                raise ValidationException(
                    "base_version_id "
                    f"{base_version_id} does not belong to project {project_id}"
                )
        return await self.db.create_candidate_change(
            project_id=project_id,
            title=title,
            summary=summary,
            payload=payload,
            session_id=session_id,
            base_version_id=base_version_id,
            proposer_user_id=user_id,
        )

    async def get_candidate_changes(
        self,
        project_id: str,
        user_id: str,
        status: Optional[str] = None,
        proposer_user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        await self.check_project_permission(project_id, user_id, "can_view")
        return await self.db.get_candidate_changes(
            project_id=project_id,
            status=status,
            proposer_user_id=proposer_user_id,
            session_id=session_id,
        )

    async def get_project_members(self, project_id: str, user_id: str):
        await self.check_project_permission(project_id, user_id, "can_view")
        return await self.db.get_project_members(project_id)

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        target_user_id: str,
        role: str,
        permissions: Optional[dict] = None,
    ):
        await self.check_project_permission(project_id, user_id, "can_manage")
        existing = await self.db.get_project_member_by_user(project_id, target_user_id)
        if existing:
            raise ConflictException(
                "User "
                f"{target_user_id} is already an active member of project {project_id}"
            )
        return await self.db.create_project_member(
            project_id=project_id,
            user_id=target_user_id,
            role=role,
            permissions=permissions,
        )

    async def update_project_member(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
        role: Optional[str] = None,
        permissions: Optional[dict] = None,
        status: Optional[str] = None,
    ):
        await self.check_project_permission(project_id, user_id, "can_manage")
        member = await self.db.get_project_member(member_id)
        if not member or member.projectId != project_id:
            raise NotFoundException(
                f"Member {member_id} not found in project {project_id}"
            )
        return await self.db.update_project_member(
            member_id=member_id,
            role=role,
            permissions=permissions,
            status=status,
        )

    async def delete_project_member(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
    ):
        await self.check_project_permission(project_id, user_id, "can_manage")
        member = await self.db.get_project_member(member_id)
        if not member or member.projectId != project_id:
            raise NotFoundException(
                f"Member {member_id} not found in project {project_id}"
            )

        project = await self.db.get_project(project_id)
        if member.userId == project.userId:
            raise ValidationException("Cannot delete project owner")

        return await self.db.delete_project_member(member_id)

    async def get_idempotency_response(self, key: str):
        return await self.db.get_idempotency_response(key)

    async def save_idempotency_response(self, key: str, response: dict):
        return await self.db.save_idempotency_response(key, response)

    async def check_dag_cycle(self, project_id: str, new_target_id: str) -> bool:
        return await check_dag_cycle(self.db, project_id, new_target_id)

    async def validate_reference_creation(
        self,
        project_id: str,
        target_project_id: str,
        relation_type: str,
        mode: str,
        pinned_version_id: Optional[str],
    ):
        return await validate_reference_creation(
            db=self.db,
            project_id=project_id,
            target_project_id=target_project_id,
            relation_type=relation_type,
            mode=mode,
            pinned_version_id=pinned_version_id,
        )

    async def review_candidate_change(
        self,
        project_id: str,
        change_id: str,
        action: str,
        review_comment: Optional[str],
        reviewer_user_id: str,
    ):
        return await review_candidate_change(
            db=self.db,
            project_id=project_id,
            change_id=change_id,
            action=action,
            review_comment=review_comment,
            reviewer_user_id=reviewer_user_id,
        )

    async def check_project_permission_with_member(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        return await self.check_project_permission(project_id, user_id, permission)


project_space_service = ProjectSpaceService()
