from __future__ import annotations

from typing import Any, Iterable, Optional

_METADATA_SOURCE_KEYS: tuple[str, ...] = (
    "rag_source_ids",
    "source_ids",
    "selected_file_ids",
    "file_ids",
)
_METADATA_LIBRARY_KEYS: tuple[str, ...] = (
    "selected_library_ids",
    "library_ids",
    "attached_library_ids",
)
_NESTED_SOURCE_CONTAINER_KEYS: tuple[str, ...] = (
    "metadata",
    "options",
    "template_config",
    "config",
)


def _normalize_source_ids(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, Iterable) or isinstance(value, (str, bytes, dict)):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def _extract_source_ids_from_mapping(metadata: dict[str, Any]) -> list[str]:
    for key in _METADATA_SOURCE_KEYS:
        candidate_ids = _normalize_source_ids(metadata.get(key))
        if candidate_ids:
            return candidate_ids

    for key in _NESTED_SOURCE_CONTAINER_KEYS:
        nested = metadata.get(key)
        if not isinstance(nested, dict):
            continue
        candidate_ids = _extract_source_ids_from_mapping(nested)
        if candidate_ids:
            return candidate_ids
    return []    


def _extract_library_ids_from_mapping(metadata: dict[str, Any]) -> list[str]:
    for key in _METADATA_LIBRARY_KEYS:
        candidate_ids = _normalize_source_ids(metadata.get(key))
        if candidate_ids:
            return candidate_ids

    for key in _NESTED_SOURCE_CONTAINER_KEYS:
        nested = metadata.get(key)
        if not isinstance(nested, dict):
            continue
        candidate_ids = _extract_library_ids_from_mapping(nested)
        if candidate_ids:
            return candidate_ids
    return []


def resolve_effective_rag_source_ids(
    *,
    rag_source_ids: Optional[list[str]],
    selected_file_ids: Optional[list[str]] = None,
    metadata: Optional[dict[str, Any]],
) -> Optional[list[str]]:
    """Resolve effective RAG source ids with backward-compatible metadata fallback."""

    if selected_file_ids is not None:
        return _normalize_source_ids(selected_file_ids)

    explicit_ids = _normalize_source_ids(rag_source_ids)
    if explicit_ids:
        return explicit_ids

    if not isinstance(metadata, dict):
        return None

    candidate_ids = _extract_source_ids_from_mapping(metadata)
    return candidate_ids or None


def resolve_effective_selected_library_ids(
    *,
    selected_library_ids: Optional[list[str]],
    metadata: Optional[dict[str, Any]],
) -> Optional[list[str]]:
    if selected_library_ids is not None:
        return _normalize_source_ids(selected_library_ids)

    if not isinstance(metadata, dict):
        return None

    candidate_ids = _extract_library_ids_from_mapping(metadata)
    return candidate_ids or None
