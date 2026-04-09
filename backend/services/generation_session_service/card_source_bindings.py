from __future__ import annotations

from schemas.project_space import ArtifactType, ProjectPermission

CARD_SOURCE_ARTIFACT_TYPES: dict[str, tuple[str, ...]] = {
    "word_document": (ArtifactType.PPTX.value,),
    "speaker_notes": (ArtifactType.PPTX.value,),
}


def get_card_source_artifact_types(card_id: str) -> tuple[str, ...]:
    return CARD_SOURCE_ARTIFACT_TYPES.get(card_id, ())


def get_card_source_permission(card_id: str) -> ProjectPermission:
    _ = card_id
    return ProjectPermission.VIEW


def serialize_card_source_artifact(artifact) -> dict:
    metadata = None
    raw_metadata = getattr(artifact, "metadata", None)
    if isinstance(raw_metadata, dict):
        metadata = raw_metadata
    title = None
    if metadata:
        title = metadata.get("title") or metadata.get("name")
    updated_at = getattr(artifact, "updatedAt", None)
    based_on_version_id = getattr(artifact, "basedOnVersionId", None)
    return {
        "id": artifact.id,
        "type": artifact.type,
        "title": title,
        "visibility": getattr(artifact, "visibility", None),
        "based_on_version_id": based_on_version_id,
        "replaces_artifact_id": (metadata or {}).get("replaces_artifact_id"),
        "superseded_by_artifact_id": (metadata or {}).get("superseded_by_artifact_id"),
        "session_id": getattr(artifact, "sessionId", None),
        "updated_at": updated_at.isoformat() if updated_at else None,
    }
