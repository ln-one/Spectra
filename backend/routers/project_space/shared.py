"""Shared helpers for Project Space routers."""

import logging

from schemas.project_space import (
    Artifact,
    CandidateChange,
    ProjectMember,
    ProjectReference,
    ProjectVersion,
)
from services.project_space_service.candidate_change_semantics import (
    parse_json_object,
    serialize_candidate_change,
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
    parsed = parse_json_object(value)
    if parsed is None and isinstance(value, str) and value.strip():
        logger.warning("Invalid JSON payload in project-space response serialization")
    return parsed


def to_project_version_model(version) -> ProjectVersion:
    snapshot = safe_parse_json(version.snapshotData) or {}
    return ProjectVersion(
        id=version.id,
        project_id=version.projectId,
        parent_version_id=version.parentVersionId,
        summary=version.summary,
        change_type=version.changeType,
        snapshot_data=snapshot,
        base_version_context=(
            snapshot.get("base_version_context") if isinstance(snapshot, dict) else None
        ),
        reference_summary=(
            snapshot.get("reference_summary") if isinstance(snapshot, dict) else None
        ),
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
    payload = serialize_candidate_change(change, isoformat_datetimes=False)
    return CandidateChange(
        **payload,
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
