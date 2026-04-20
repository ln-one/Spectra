from __future__ import annotations

import json

from schemas.project_space import ArtifactType, ProjectPermission

CARD_SOURCE_ARTIFACT_TYPES: dict[str, tuple[str, ...]] = {
    "word_document": (ArtifactType.PPTX.value,),
    "speaker_notes": (ArtifactType.PPTX.value,),
    "demonstration_animations": (ArtifactType.PPTX.value,),
}

OPTIONAL_SOURCE_CARD_IDS = {
    "word_document",
    "demonstration_animations",
}


def get_card_source_artifact_types(card_id: str) -> tuple[str, ...]:
    return CARD_SOURCE_ARTIFACT_TYPES.get(card_id, ())


def is_card_source_optional(card_id: str) -> bool:
    return card_id in OPTIONAL_SOURCE_CARD_IDS


def get_card_source_permission(card_id: str) -> ProjectPermission:
    _ = card_id
    return ProjectPermission.VIEW


def _parse_artifact_metadata(raw_metadata) -> dict:
    if isinstance(raw_metadata, dict):
        return raw_metadata
    if isinstance(raw_metadata, str):
        try:
            parsed = json.loads(raw_metadata)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _resolve_card_source_title(metadata: dict) -> str | None:
    for key in ("title", "name", "run_title"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def serialize_card_source_artifact(
    artifact,
    *,
    current_version_id: str | None = None,
) -> dict:
    metadata = _parse_artifact_metadata(getattr(artifact, "metadata", None))
    title = _resolve_card_source_title(metadata)
    updated_at = getattr(artifact, "updatedAt", None)
    based_on_version_id = getattr(artifact, "basedOnVersionId", None)
    return {
        "id": artifact.id,
        "project_id": getattr(artifact, "projectId", None),
        "type": artifact.type,
        "title": title,
        "visibility": getattr(artifact, "visibility", None),
        "based_on_version_id": based_on_version_id,
        "replaces_artifact_id": (metadata or {}).get("replaces_artifact_id"),
        "superseded_by_artifact_id": (metadata or {}).get("superseded_by_artifact_id"),
        "session_id": getattr(artifact, "sessionId", None),
        "updated_at": updated_at.isoformat() if updated_at else None,
    }


def build_source_binding_candidate_payload(
    *,
    card_id: str,
    sources: list[dict],
    selected_ids: list[str] | None = None,
) -> dict:
    accepted_types = list(get_card_source_artifact_types(card_id))
    required = bool(accepted_types and not is_card_source_optional(card_id))
    normalized_selected_ids = [
        item for item in (selected_ids or []) if isinstance(item, str) and item.strip()
    ]
    return {
        "required": required,
        "mode": "single_artifact" if accepted_types else "none",
        "accepted_types": accepted_types,
        "selected_ids": normalized_selected_ids,
        "visibility_scope": "project-visible",
        "status": "bound"
        if normalized_selected_ids
        else ("required_missing" if required else "optional"),
        "sources": sources,
    }
