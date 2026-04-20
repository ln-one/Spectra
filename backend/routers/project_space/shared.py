"""Shared helpers for thin project-space consumer routes."""

import logging
from typing import Any

from schemas.project_space import (
    Artifact,
    CandidateChange,
    ProjectMember,
    ProjectReference,
    ProjectVersion,
)
from services.project_space_service.candidate_change_semantics import parse_json_object

logger = logging.getLogger(__name__)

PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

COMMON_ERROR_RESPONSES = {
    401: {"description": "Unauthorized"},
    403: {"description": "Forbidden"},
    404: {"description": "Not Found"},
}


def safe_parse_json(value: Any):
    parsed = parse_json_object(value)
    if parsed is None and isinstance(value, str) and value.strip():
        logger.warning("Invalid JSON payload in project-space response serialization")
    return parsed


def to_project_version_model(version) -> ProjectVersion:
    return ProjectVersion(
        id=version.id,
        projectId=version.projectId,
        parentVersionId=getattr(version, "parentVersionId", None),
        summary=getattr(version, "summary", None),
        changeType=getattr(version, "changeType", None),
        snapshotData=safe_parse_json(getattr(version, "snapshotData", None)),
        createdBy=getattr(version, "createdBy", None),
        createdAt=getattr(version, "createdAt", None),
    )


def to_artifact_model(artifact) -> Artifact:
    return Artifact(
        id=artifact.id,
        projectId=artifact.projectId,
        sessionId=getattr(artifact, "sessionId", None),
        basedOnVersionId=getattr(artifact, "basedOnVersionId", None),
        ownerUserId=getattr(artifact, "ownerUserId", None),
        type=artifact.type,
        visibility=artifact.visibility,
        storagePath=getattr(artifact, "storagePath", None),
        metadata=safe_parse_json(getattr(artifact, "metadata", None)),
        createdAt=getattr(artifact, "createdAt", None),
        updatedAt=getattr(artifact, "updatedAt", None),
    )


def to_project_reference_model(
    reference, *, target_project_name: str | None = None
) -> ProjectReference:
    return ProjectReference(
        id=reference.id,
        projectId=reference.projectId,
        targetProjectId=reference.targetProjectId,
        targetProjectName=target_project_name
        if target_project_name is not None
        else getattr(reference, "targetProjectName", None),
        relationType=reference.relationType,
        mode=reference.mode,
        pinnedVersionId=getattr(reference, "pinnedVersionId", None),
        priority=getattr(reference, "priority", 0),
        status=getattr(reference, "status", "active"),
        createdBy=getattr(reference, "createdBy", None),
        createdAt=getattr(reference, "createdAt", None),
        updatedAt=getattr(reference, "updatedAt", None),
    )


def to_candidate_change_model(change) -> CandidateChange:
    payload = safe_parse_json(getattr(change, "payload", None))
    return CandidateChange(
        id=change.id,
        projectId=change.projectId,
        sessionId=getattr(change, "sessionId", None),
        baseVersionId=getattr(change, "baseVersionId", None),
        title=change.title,
        summary=getattr(change, "summary", None),
        payload=payload,
        changeKind=getattr(change, "changeKind", None),
        changeContext=safe_parse_json(getattr(change, "changeContext", None)),
        acceptedSnapshot=safe_parse_json(getattr(change, "acceptedSnapshot", None)),
        status=getattr(change, "status", "pending"),
        reviewComment=getattr(change, "reviewComment", None),
        reviewedBy=getattr(change, "reviewedBy", None),
        reviewedAt=getattr(change, "reviewedAt", None),
        acceptedVersionId=(
            getattr(change, "acceptedVersionId", None)
            or (payload or {}).get("review", {}).get("accepted_version_id")
        ),
        proposerUserId=getattr(change, "proposerUserId", None),
        createdAt=getattr(change, "createdAt", None),
        updatedAt=getattr(change, "updatedAt", None),
    )


def to_project_member_model(member) -> ProjectMember:
    return ProjectMember(
        id=member.id,
        projectId=member.projectId,
        userId=member.userId,
        role=member.role,
        permissions=safe_parse_json(getattr(member, "permissions", None)),
        status=getattr(member, "status", "active"),
        createdAt=getattr(member, "createdAt", None),
    )
