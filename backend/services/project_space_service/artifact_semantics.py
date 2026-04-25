"""Shared artifact semantics for Project Space and generation flows."""

from __future__ import annotations

import json
from copy import deepcopy
from enum import Enum

from schemas.project_space import ArtifactType, ArtifactVisibility


class ProjectCapability(str, Enum):
    PPT = "ppt"
    WORD = "word"
    MINDMAP = "mindmap"
    OUTLINE = "outline"
    QUIZ = "quiz"
    SUMMARY = "summary"
    ANIMATION = "animation"
    HANDOUT = "handout"


class ArtifactMetadataKind(str, Enum):
    OUTLINE = "outline"
    HANDOUT = "handout"
    ANIMATION_STORYBOARD = "animation_storyboard"
    SPEAKER_NOTES = "speaker_notes"
    CLASSROOM_QA_SIMULATOR = "classroom_qa_simulator"


class EntryRoute(str, Enum):
    SESSION_FIRST = "session-first"
    ARTIFACT_LITE = "artifact-lite"


ARTIFACT_EXTENSION_MAP: dict[str, str] = {
    ArtifactType.PPTX.value: "pptx",
    ArtifactType.DOCX.value: "docx",
    ArtifactType.MINDMAP.value: "json",
    ArtifactType.SUMMARY.value: "json",
    ArtifactType.EXERCISE.value: "json",
    ArtifactType.HTML.value: "html",
    ArtifactType.GIF.value: "gif",
    ArtifactType.MP4.value: "mp4",
}

ARTIFACT_MEDIA_TYPE_MAP: dict[str, str] = {
    ArtifactType.PPTX.value: (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ),
    ArtifactType.DOCX.value: (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    ArtifactType.MINDMAP.value: "application/json",
    ArtifactType.SUMMARY.value: "application/json",
    ArtifactType.EXERCISE.value: "application/json",
    ArtifactType.HTML.value: "text/html",
    ArtifactType.GIF.value: "image/gif",
    ArtifactType.MP4.value: "video/mp4",
}

ARTIFACT_CAPABILITY_MAP: dict[str, str] = {
    ArtifactType.PPTX.value: ProjectCapability.PPT.value,
    ArtifactType.DOCX.value: ProjectCapability.WORD.value,
    ArtifactType.MINDMAP.value: ProjectCapability.MINDMAP.value,
    ArtifactType.SUMMARY.value: ProjectCapability.SUMMARY.value,
    ArtifactType.EXERCISE.value: ProjectCapability.QUIZ.value,
    ArtifactType.HTML.value: ProjectCapability.ANIMATION.value,
    ArtifactType.GIF.value: ProjectCapability.ANIMATION.value,
    ArtifactType.MP4.value: "video",
}

SUPPORTED_FILE_ARTIFACT_TYPES: tuple[str, ...] = tuple(ARTIFACT_EXTENSION_MAP.keys())

DEFAULT_ARTIFACT_CONTENT: dict[str, dict] = {
    ArtifactType.PPTX.value: {"title": "PPT demo", "slides": []},
    ArtifactType.DOCX.value: {"title": "Teaching handout", "sections": []},
    ArtifactType.MINDMAP.value: {"title": "Mindmap", "nodes": []},
    ArtifactType.SUMMARY.value: {
        "title": "Course summary",
        "summary": "",
        "key_points": [],
        "slides": [],
        "turns": [],
    },
    ArtifactType.EXERCISE.value: {"title": "Exercise", "questions": []},
    ArtifactType.HTML.value: {"html": "<html><body>Empty</body></html>"},
    ArtifactType.GIF.value: {"title": "Animation placeholder", "scenes": []},
    ArtifactType.MP4.value: {"title": "Video placeholder"},
}

ARTIFACT_MODE_KIND_MAP: dict[tuple[str, str], tuple[str, str]] = {
    (
        ArtifactType.SUMMARY.value,
        ArtifactMetadataKind.OUTLINE.value,
    ): ("课程大纲", ArtifactMetadataKind.OUTLINE.value),
    (
        ArtifactType.DOCX.value,
        ArtifactMetadataKind.HANDOUT.value,
    ): ("教学讲义", ArtifactMetadataKind.HANDOUT.value),
    (
        ArtifactType.HTML.value,
        ArtifactMetadataKind.ANIMATION_STORYBOARD.value,
    ): (
        "Animation Storyboard",
        ArtifactMetadataKind.ANIMATION_STORYBOARD.value,
    ),
}

CAPABILITY_ARTIFACT_MAPPING: dict[str, dict[str, str]] = {
    ProjectCapability.PPT.value: {"artifact_type": ArtifactType.PPTX.value},
    ProjectCapability.WORD.value: {"artifact_type": ArtifactType.DOCX.value},
    ProjectCapability.MINDMAP.value: {"artifact_type": ArtifactType.MINDMAP.value},
    ProjectCapability.OUTLINE.value: {
        "artifact_type": ArtifactType.SUMMARY.value,
        "metadata_kind": ArtifactMetadataKind.OUTLINE.value,
    },
    ProjectCapability.QUIZ.value: {"artifact_type": ArtifactType.EXERCISE.value},
    ProjectCapability.SUMMARY.value: {"artifact_type": ArtifactType.SUMMARY.value},
    ProjectCapability.ANIMATION.value: {
        "artifact_type": ArtifactType.HTML.value,
        "metadata_kind": ArtifactMetadataKind.ANIMATION_STORYBOARD.value,
    },
    ProjectCapability.HANDOUT.value: {
        "artifact_type": ArtifactType.DOCX.value,
        "metadata_kind": ArtifactMetadataKind.HANDOUT.value,
    },
}

WAVE1_ENTRY_ROUTE_MAPPING: dict[str, dict[str, str | bool]] = {
    ProjectCapability.PPT.value: {
        "entry_route": EntryRoute.SESSION_FIRST.value,
        "session_required": True,
    },
    ProjectCapability.WORD.value: {
        "entry_route": EntryRoute.SESSION_FIRST.value,
        "session_required": True,
    },
    ProjectCapability.OUTLINE.value: {
        "entry_route": EntryRoute.SESSION_FIRST.value,
        "session_required": True,
    },
    ProjectCapability.SUMMARY.value: {
        "entry_route": EntryRoute.ARTIFACT_LITE.value,
        "session_required": False,
    },
}

ALL_PROJECT_CAPABILITIES: tuple[str, ...] = tuple(CAPABILITY_ARTIFACT_MAPPING.keys())


def normalize_project_capability(capability: ProjectCapability | str) -> str:
    return (
        capability.value
        if isinstance(capability, ProjectCapability)
        else str(capability)
    )


def normalize_entry_route(entry_route: EntryRoute | str) -> str:
    return (
        entry_route.value if isinstance(entry_route, EntryRoute) else str(entry_route)
    )


def get_capability_artifact_expectation(
    capability: ProjectCapability | str,
) -> dict[str, str] | None:
    return CAPABILITY_ARTIFACT_MAPPING.get(normalize_project_capability(capability))


def get_wave1_entry_rule(
    capability: ProjectCapability | str,
) -> dict[str, str | bool] | None:
    return WAVE1_ENTRY_ROUTE_MAPPING.get(normalize_project_capability(capability))


def normalize_artifact_type(artifact_type: ArtifactType | str) -> str:
    if isinstance(artifact_type, Enum):
        return str(artifact_type.value)
    return str(artifact_type)


def normalize_artifact_visibility(
    value: ArtifactVisibility | str | None,
) -> ArtifactVisibility:
    if value is None:
        return ArtifactVisibility.PRIVATE
    return value if isinstance(value, ArtifactVisibility) else ArtifactVisibility(value)


def is_artifact_shared(value: ArtifactVisibility | str | None) -> bool:
    return normalize_artifact_visibility(value) is ArtifactVisibility.SHARED


def is_artifact_project_visible(value: ArtifactVisibility | str | None) -> bool:
    return normalize_artifact_visibility(value) is ArtifactVisibility.PROJECT_VISIBLE


def default_artifact_content(artifact_type: ArtifactType | str) -> dict:
    normalized = normalize_artifact_type(artifact_type)
    return deepcopy(
        DEFAULT_ARTIFACT_CONTENT.get(
            normalized,
            {"title": f"{normalized} artifact", "data": []},
        )
    )


def get_artifact_extension(artifact_type: ArtifactType | str) -> str:
    return ARTIFACT_EXTENSION_MAP.get(normalize_artifact_type(artifact_type), "bin")


def get_artifact_media_type(artifact_type: ArtifactType | str) -> str:
    return ARTIFACT_MEDIA_TYPE_MAP.get(
        normalize_artifact_type(artifact_type), "application/octet-stream"
    )


def get_artifact_capability(artifact_type: ArtifactType | str) -> str:
    normalized = normalize_artifact_type(artifact_type)
    return ARTIFACT_CAPABILITY_MAP.get(normalized, normalized)


def resolve_capability_from_artifact(
    artifact_type: ArtifactType | str, metadata_kind: str | None = None
) -> str:
    normalized_type = normalize_artifact_type(artifact_type)
    normalized_kind = str(metadata_kind or "").strip().lower()
    for capability, expectation in CAPABILITY_ARTIFACT_MAPPING.items():
        if expectation["artifact_type"] != normalized_type:
            continue
        expected_kind = expectation.get("metadata_kind")
        if expected_kind and expected_kind != normalized_kind:
            continue
        return capability
    return get_artifact_capability(normalized_type)


def build_artifact_download_filename(
    artifact_type: ArtifactType | str,
    artifact_id: str,
    *,
    metadata: dict | str | None = None,
) -> str:
    normalized = normalize_artifact_type(artifact_type)
    extension = get_artifact_extension(normalized)
    title = _extract_artifact_title(metadata)
    if title:
        safe_title = _sanitize_download_basename(title)
        if safe_title:
            return f"{safe_title}.{extension}"
    return f"{normalized}_{artifact_id}.{extension}"


def _extract_artifact_title(metadata: dict | str | None) -> str:
    parsed: dict = {}
    if isinstance(metadata, dict):
        parsed = metadata
    elif isinstance(metadata, str) and metadata.strip():
        try:
            loaded = json.loads(metadata)
        except (TypeError, json.JSONDecodeError):
            loaded = {}
        if isinstance(loaded, dict):
            parsed = loaded
    title = str(parsed.get("title") or "").strip()
    return title[:120]


def _sanitize_download_basename(value: str) -> str:
    # Windows reserved characters and control chars are replaced with underscores.
    blocked = '<>:"/\\|?*'
    sanitized_chars = []
    for ch in str(value or "").strip():
        if ord(ch) < 32 or ch in blocked:
            sanitized_chars.append("_")
            continue
        sanitized_chars.append(ch)
    sanitized = "".join(sanitized_chars).strip(" .")
    if not sanitized:
        return ""
    return sanitized[:80]
