"""Shared helpers for Project Space routers."""

import json
import logging

from schemas.project_space import (
    Artifact,
    CandidateChange,
    ProjectMember,
    ProjectReference,
    ProjectVersion,
)

logger = logging.getLogger(__name__)

PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

COMMON_ERROR_RESPONSES = {
    401: {"description": "Unauthorized"},
    403: {"description": "Forbidden"},
    404: {"description": "Not Found"},
}


def safe_parse_json(value):
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


def to_project_version_model(version) -> ProjectVersion:
    return ProjectVersion(
        id=version.id,
        project_id=version.projectId,
        parent_version_id=version.parentVersionId,
        summary=version.summary,
        change_type=version.changeType,
        snapshot_data=safe_parse_json(version.snapshotData),
        created_by=version.createdBy,
        created_at=version.createdAt,
    )


def to_artifact_model(artifact) -> Artifact:
    return Artifact(
        id=artifact.id,
        project_id=artifact.projectId,
        session_id=artifact.sessionId,
        based_on_version_id=artifact.basedOnVersionId,
        owner_user_id=artifact.ownerUserId,
        type=artifact.type,
        visibility=artifact.visibility,
        storage_path=artifact.storagePath,
        metadata=safe_parse_json(artifact.metadata),
        created_at=artifact.createdAt,
        updated_at=artifact.updatedAt,
    )


def to_project_reference_model(reference) -> ProjectReference:
    return ProjectReference(
        id=reference.id,
        project_id=reference.projectId,
        target_project_id=reference.targetProjectId,
        relation_type=reference.relationType,
        mode=reference.mode,
        pinned_version_id=reference.pinnedVersionId,
        priority=reference.priority,
        status=reference.status,
        created_by=reference.createdBy,
        created_at=reference.createdAt,
        updated_at=reference.updatedAt,
    )


def to_candidate_change_model(change) -> CandidateChange:
    payload = safe_parse_json(change.payload)
    review = payload.get("review") if isinstance(payload, dict) else None
    accepted_version_id = None
    if isinstance(review, dict):
        accepted_version_id = review.get("accepted_version_id")
    return CandidateChange(
        id=change.id,
        project_id=change.projectId,
        title=change.title,
        summary=change.summary,
        payload=payload,
        session_id=change.sessionId,
        base_version_id=change.baseVersionId,
        status=change.status,
        review_comment=getattr(change, "reviewComment", None),
        accepted_version_id=accepted_version_id,
        proposer_user_id=change.proposerUserId,
        created_at=change.createdAt,
        updated_at=change.updatedAt,
    )


def to_project_member_model(member) -> ProjectMember:
    return ProjectMember(
        id=member.id,
        project_id=member.projectId,
        user_id=member.userId,
        role=member.role,
        permissions=safe_parse_json(member.permissions),
        status=member.status,
        created_at=member.createdAt,
    )
