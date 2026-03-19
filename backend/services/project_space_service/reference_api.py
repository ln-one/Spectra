"""Project space reference and review service methods."""

from __future__ import annotations

from typing import Optional

from .reference_validation import check_dag_cycle, validate_reference_creation
from .references import create_candidate_change as create_candidate_change_record
from .references import create_project_reference as create_project_reference_record
from .references import delete_project_reference as delete_project_reference_record
from .references import get_candidate_changes as get_candidate_changes_list
from .references import get_project_references as get_project_references_list
from .references import update_project_reference as update_project_reference_record
from .review import review_candidate_change


class ProjectSpaceReferenceAPIMixin:
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
