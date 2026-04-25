from __future__ import annotations

from typing import Optional

ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE = {
    "pptx": "ppt",
    "docx": "word",
    "mindmap": "mindmap",
}

ARTIFACT_SOURCE_SURFACE_KIND_BY_ARTIFACT_TYPE = {
    "pptx": "slides",
    "docx": "document",
    "mindmap": "graph",
}

SUPPORTED_ARTIFACT_SOURCE_TYPES = set(
    ARTIFACT_SOURCE_TOOL_TYPE_BY_ARTIFACT_TYPE.keys()
)


def resolve_artifact_source_surface_kind(
    artifact_type: str,
    artifact_metadata: Optional[dict],
    requested_surface_kind: Optional[str],
) -> Optional[str]:
    explicit = str(requested_surface_kind or "").strip()
    if explicit:
        return explicit
    if artifact_type == "docx" and isinstance(artifact_metadata, dict):
        if str(artifact_metadata.get("schema_id") or "").strip() == "lesson_plan_v1":
            return "lesson_plan"
        if str(artifact_metadata.get("kind") or "").strip() == "teaching_document":
            return "lesson_plan"
    return ARTIFACT_SOURCE_SURFACE_KIND_BY_ARTIFACT_TYPE.get(artifact_type)
