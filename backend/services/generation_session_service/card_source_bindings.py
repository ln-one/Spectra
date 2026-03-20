from __future__ import annotations

from schemas.project_space import ArtifactType, ProjectPermission

CARD_SOURCE_ARTIFACT_TYPES: dict[str, tuple[str, ...]] = {
    "speaker_notes": (ArtifactType.PPTX.value,),
}


def get_card_source_artifact_types(card_id: str) -> tuple[str, ...]:
    return CARD_SOURCE_ARTIFACT_TYPES.get(card_id, ())


def get_card_source_permission(card_id: str) -> ProjectPermission:
    _ = card_id
    return ProjectPermission.VIEW


def serialize_card_source_artifact(
    artifact,
    *,
    current_version_id: str | None = None,
) -> dict:
    metadata = None
    raw_metadata = getattr(artifact, "metadata", None)
    if isinstance(raw_metadata, dict):
        metadata = raw_metadata
    title = None
    if metadata:
        title = metadata.get("title") or metadata.get("name")

    updated_at = getattr(artifact, "updatedAt", None)
    based_on_version_id = getattr(artifact, "basedOnVersionId", None)
    upstream_updated = bool(
        based_on_version_id
        and current_version_id
        and based_on_version_id != current_version_id
    )
    return {
        "id": artifact.id,
        "type": artifact.type,
        "title": title,
        "visibility": getattr(artifact, "visibility", None),
        "based_on_version_id": based_on_version_id,
        "current_version_id": current_version_id,
        "upstream_updated": upstream_updated,
        "session_id": getattr(artifact, "sessionId", None),
        "updated_at": updated_at.isoformat() if updated_at else None,
    }
