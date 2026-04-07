from __future__ import annotations

from schemas.project_space import ArtifactType, ProjectPermission

CARD_SOURCE_ARTIFACT_TYPES: dict[str, tuple[str, ...]] = {
    "word_document": (ArtifactType.PPTX.value,),
    "speaker_notes": (ArtifactType.PPTX.value,),
    "demonstration_animations": (ArtifactType.PPTX.value,),
}

OPTIONAL_SOURCE_CARD_IDS = {
    "demonstration_animations",
}


def get_card_source_artifact_types(card_id: str) -> tuple[str, ...]:
    return CARD_SOURCE_ARTIFACT_TYPES.get(card_id, ())


def is_card_source_optional(card_id: str) -> bool:
    return card_id in OPTIONAL_SOURCE_CARD_IDS


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
    is_current = bool((metadata or {}).get("is_current", True))

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
        "is_current": is_current,
        "replaces_artifact_id": (metadata or {}).get("replaces_artifact_id"),
        "superseded_by_artifact_id": (metadata or {}).get("superseded_by_artifact_id"),
        "session_id": getattr(artifact, "sessionId", None),
        "updated_at": updated_at.isoformat() if updated_at else None,
    }
