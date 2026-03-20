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


def to_project_version_model(
    version,
    *,
    current_version_id: str | None = None,
) -> ProjectVersion:
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
        current_version_id=current_version_id,
        is_current=bool(current_version_id and version.id == current_version_id),
        created_by=version.createdBy,
        created_at=version.createdAt,
    )


def to_artifact_model(artifact, current_version_id: str | None = None) -> Artifact:
    based_on_version_id = getattr(artifact, "basedOnVersionId", None)
    metadata = safe_parse_json(getattr(artifact, "metadata", None))
    upstream_updated = bool(
        based_on_version_id
        and current_version_id
        and based_on_version_id != current_version_id
    )
    return Artifact(
        id=artifact.id,
        project_id=artifact.projectId,
        session_id=artifact.sessionId,
        based_on_version_id=based_on_version_id,
        owner_user_id=artifact.ownerUserId,
        type=artifact.type,
        visibility=artifact.visibility,
        storage_path=artifact.storagePath,
        metadata=metadata,
        mode=metadata.get("mode") if isinstance(metadata, dict) else None,
        replaces_artifact_id=(
            metadata.get("replaces_artifact_id") if isinstance(metadata, dict) else None
        ),
        superseded_by_artifact_id=(
            metadata.get("superseded_by_artifact_id")
            if isinstance(metadata, dict)
            else None
        ),
        is_current=(
            bool(metadata.get("is_current", True))
            if isinstance(metadata, dict)
            else True
        ),
        current_version_id=current_version_id,
        upstream_updated=upstream_updated,
        upstream_update_reason=(
            "project_version_advanced" if upstream_updated else None
        ),
        created_at=artifact.createdAt,
        updated_at=artifact.updatedAt,
    )


def to_project_reference_model(
    reference,
    *,
    upstream_current_version_id: str | None = None,
) -> ProjectReference:
    effective_target_version_id = (
        reference.pinnedVersionId
        if reference.mode == "pinned"
        else upstream_current_version_id
    )
    upstream_updated = bool(
        reference.mode == "pinned"
        and reference.pinnedVersionId
        and upstream_current_version_id
        and reference.pinnedVersionId != upstream_current_version_id
    )
    return ProjectReference(
        id=reference.id,
        project_id=reference.projectId,
        target_project_id=reference.targetProjectId,
        relation_type=reference.relationType,
        mode=reference.mode,
        pinned_version_id=reference.pinnedVersionId,
        priority=reference.priority,
        status=reference.status,
        effective_target_version_id=effective_target_version_id,
        upstream_current_version_id=upstream_current_version_id,
        upstream_updated=upstream_updated,
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
