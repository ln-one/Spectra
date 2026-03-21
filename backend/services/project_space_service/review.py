"""Candidate change review helpers for Project Space service."""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from schemas.project_space import (
    CandidateChangeReviewAction,
    CandidateChangeStatus,
    ChangeType,
)
from utils.exceptions import ConflictException, NotFoundException, ValidationException

logger = logging.getLogger(__name__)


def _normalize_change_payload(payload):
    if isinstance(payload, str):
        try:
            payload = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    return payload


async def _validate_change_version_anchor(
    db, *, project_id: str, base_version_id: Optional[str]
):
    if not base_version_id:
        return
    base_version = await db.get_project_version(base_version_id)
    if not base_version or getattr(base_version, "projectId", None) != project_id:
        raise ConflictException(
            "Base version is missing or no longer belongs to the project."
        )


async def _validate_created_version(db, *, project_id: str, version):
    if not version or getattr(version, "projectId", project_id) != project_id:
        raise ConflictException(
            "Accepted candidate change created an invalid project version."
        )


async def review_candidate_change(
    db,
    project_id: str,
    change_id: str,
    action: CandidateChangeReviewAction | str,
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
    if change.status != CandidateChangeStatus.PENDING:
        raise ConflictException(f"Status conflict: {change.status}")

    try:
        normalized_action = CandidateChangeReviewAction(action)
    except ValueError as exc:
        raise ValidationException(
            f"Invalid action: {action}. Only accept/reject are supported."
        ) from exc

    if normalized_action == CandidateChangeReviewAction.ACCEPT:
        project = await db.get_project(change.projectId)
        if not project:
            raise NotFoundException(f"Project not found: {change.projectId}")

        current_version_id = getattr(project, "currentVersionId", None)
        base_version_id = getattr(change, "baseVersionId", None)
        if base_version_id != current_version_id:
            raise ConflictException(
                "Base version conflicts with current project version."
            )

        await _validate_change_version_anchor(
            db,
            project_id=change.projectId,
            base_version_id=base_version_id,
        )

        payload = _normalize_change_payload(change.payload)

        references = await db.get_project_references(change.projectId)
        reference_summary = [
            {
                "reference_id": reference.id,
                "target_project_id": reference.targetProjectId,
                "relation_type": reference.relationType,
                "mode": reference.mode,
                "pinned_version_id": getattr(reference, "pinnedVersionId", None),
                "priority": reference.priority,
                "status": reference.status,
            }
            for reference in references
        ]

        version_snapshot = dict(payload)
        version_snapshot["base_version_context"] = {
            "base_version_id": base_version_id,
            "current_version_id": current_version_id,
        }
        version_snapshot["reference_summary"] = reference_summary

        new_version = await db.create_project_version(
            project_id=change.projectId,
            parent_version_id=change.baseVersionId,
            summary=change.summary or change.title,
            change_type=ChangeType.MERGE_CHANGE,
            snapshot_data=version_snapshot,
            created_by=reviewer_user_id,
        )
        await _validate_created_version(
            db,
            project_id=change.projectId,
            version=new_version,
        )
        await db.update_project_current_version(change.projectId, new_version.id)
        review_payload = dict(version_snapshot)
        reviewed_at = datetime.now(timezone.utc)
        review_payload["review"] = {
            "action": CandidateChangeReviewAction.ACCEPT,
            "accepted_version_id": new_version.id,
            "reviewer_user_id": reviewer_user_id,
            "reviewed_at": reviewed_at.isoformat(),
        }
        if review_comment is not None:
            review_payload["review"]["review_comment"] = review_comment
        updated_change = await db.update_candidate_change_status(
            change_id,
            CandidateChangeStatus.ACCEPTED,
            review_comment,
            reviewed_by=reviewer_user_id,
            reviewed_at=reviewed_at,
            payload=review_payload,
        )
        sibling_changes = await db.get_candidate_changes(
            project_id=change.projectId,
            status=CandidateChangeStatus.PENDING,
            session_id=getattr(change, "sessionId", None),
        )
        for sibling in sibling_changes:
            if sibling.id == change_id:
                continue
            if getattr(sibling, "baseVersionId", None) != base_version_id:
                continue
            await db.update_candidate_change_status(
                sibling.id,
                CandidateChangeStatus.SUPERSEDED,
                review_comment="Superseded by accepted candidate change",
            )
        logger.info(
            f"Accepted candidate change {change_id}, created version {new_version.id}"
        )
        return updated_change

    if normalized_action == CandidateChangeReviewAction.REJECT:
        reviewed_at = datetime.now(timezone.utc)
        updated_change = await db.update_candidate_change_status(
            change_id,
            CandidateChangeStatus.REJECTED,
            review_comment,
            reviewed_by=reviewer_user_id,
            reviewed_at=reviewed_at,
        )
        logger.info(f"Rejected candidate change {change_id}")
        return updated_change

    raise ValidationException(
        f"Invalid action: {action}. Only accept/reject are supported."
    )
