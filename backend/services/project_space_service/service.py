"""Project Space service orchestrator."""

import json
import logging
from typing import Optional

from services.database import db_service
from utils.exceptions import ForbiddenException, NotFoundException

from .artifacts import create_artifact_with_file, get_artifact_storage_path
from .members import create_project_member as create_project_member_record
from .members import delete_project_member as delete_project_member_record
from .members import get_project_members as get_project_members_list
from .members import update_project_member as update_project_member_record
from .reference_validation import check_dag_cycle, validate_reference_creation
from .references import create_candidate_change as create_candidate_change_record
from .references import create_project_reference as create_project_reference_record
from .references import delete_project_reference as delete_project_reference_record
from .references import get_candidate_changes as get_candidate_changes_list
from .references import get_project_references as get_project_references_list
from .references import update_project_reference as update_project_reference_record
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
        return await create_project_reference_record(
            self,
            project_id=project_id,
            user_id=user_id,
            target_project_id=target_project_id,
            relation_type=relation_type,
            mode=mode,
            pinned_version_id=pinned_version_id,
            priority=priority,
        )

    async def get_project_references(self, project_id: str, user_id: str):
        return await get_project_references_list(self, project_id, user_id)

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
        return await update_project_reference_record(
            self,
            project_id=project_id,
            reference_id=reference_id,
            user_id=user_id,
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
        return await delete_project_reference_record(
            self,
            project_id=project_id,
            reference_id=reference_id,
            user_id=user_id,
        )

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
        return await create_candidate_change_record(
            self,
            project_id=project_id,
            user_id=user_id,
            title=title,
            summary=summary,
            payload=payload,
            session_id=session_id,
            base_version_id=base_version_id,
        )

    async def get_candidate_changes(
        self,
        project_id: str,
        user_id: str,
        status: Optional[str] = None,
        proposer_user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        return await get_candidate_changes_list(
            self,
            project_id=project_id,
            user_id=user_id,
            status=status,
            proposer_user_id=proposer_user_id,
            session_id=session_id,
        )

    async def get_project_members(self, project_id: str, user_id: str):
        return await get_project_members_list(self, project_id, user_id)

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        target_user_id: str,
        role: str,
        permissions: Optional[dict] = None,
    ):
        return await create_project_member_record(
            self,
            project_id=project_id,
            user_id=user_id,
            target_user_id=target_user_id,
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
        return await update_project_member_record(
            self,
            project_id=project_id,
            member_id=member_id,
            user_id=user_id,
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
        return await delete_project_member_record(
            self,
            project_id=project_id,
            member_id=member_id,
            user_id=user_id,
        )

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
