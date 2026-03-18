"""Candidate change review helpers for Project Space service."""

import json
import logging
from typing import Optional

from utils.exceptions import ConflictException, NotFoundException, ValidationException

logger = logging.getLogger(__name__)


async def review_candidate_change(
    db,
    project_id: str,
    change_id: str,
    action: str,
    review_comment: Optional[str],
    reviewer_user_id: str,
):
    """Review a candidate change and update project version state when accepted."""
    change = await db.get_candidate_change(change_id)
    if not change:
        raise NotFoundException(f"Candidate change not found: {change_id}")
    if change.projectId != project_id:
        raise NotFoundException(
            f"Candidate change {change_id} not found in project {project_id}"
        )
    if change.status != "pending":
        raise ConflictException(f"Status conflict: {change.status}")

    if action == "accept":
        project = await db.get_project(change.projectId)
        if not project:
            raise NotFoundException(f"Project not found: {change.projectId}")

        current_version_id = getattr(project, "currentVersionId", None)
        base_version_id = getattr(change, "baseVersionId", None)
        if base_version_id != current_version_id:
            raise ConflictException(
                "Base version conflicts with current project version."
            )

        payload = change.payload
        if isinstance(payload, str):
            payload = json.loads(payload) if payload else {}

        new_version = await db.create_project_version(
            project_id=change.projectId,
            parent_version_id=change.baseVersionId,
            summary=change.summary or change.title,
            change_type="merge-change",
            snapshot_data=payload,
            created_by=reviewer_user_id,
        )
        await db.update_project_current_version(change.projectId, new_version.id)
        updated_change = await db.update_candidate_change_status(
            change_id, "accepted", review_comment
        )
        logger.info(
            f"Accepted candidate change {change_id}, created version {new_version.id}"
        )
        return updated_change

    if action == "reject":
        updated_change = await db.update_candidate_change_status(
            change_id, "rejected", review_comment
        )
        logger.info(f"Rejected candidate change {change_id}")
        return updated_change

    raise ValidationException(
        f"Invalid action: {action}. Only accept/reject are supported."
    )
