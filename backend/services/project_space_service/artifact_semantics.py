"""Shared artifact semantics for Project Space and generation flows."""

from __future__ import annotations

from copy import deepcopy

from schemas.project_space import ArtifactType

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
    ArtifactType.PPTX.value: "ppt",
    ArtifactType.DOCX.value: "word",
    ArtifactType.MINDMAP.value: "mindmap",
    ArtifactType.SUMMARY.value: "summary",
    ArtifactType.EXERCISE.value: "quiz",
    ArtifactType.HTML.value: "animation",
    ArtifactType.GIF.value: "animation",
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
    },
    ArtifactType.EXERCISE.value: {"title": "Exercise", "questions": []},
    ArtifactType.HTML.value: {"html": "<html><body>Empty</body></html>"},
    ArtifactType.GIF.value: {"title": "Animation placeholder", "scenes": []},
    ArtifactType.MP4.value: {"title": "Video placeholder"},
}

ARTIFACT_MODE_KIND_MAP: dict[tuple[str, str], tuple[str, str]] = {
    (ArtifactType.SUMMARY.value, "outline"): ("课程大纲", "outline"),
    (ArtifactType.DOCX.value, "handout"): ("教学讲义", "handout"),
    (ArtifactType.HTML.value, "animation_storyboard"): (
        "Animation Storyboard",
        "animation_storyboard",
    ),
}

CAPABILITY_ARTIFACT_MAPPING: dict[str, dict[str, str]] = {
    "ppt": {"artifact_type": ArtifactType.PPTX.value},
    "word": {"artifact_type": ArtifactType.DOCX.value},
    "mindmap": {"artifact_type": ArtifactType.MINDMAP.value},
    "outline": {
        "artifact_type": ArtifactType.SUMMARY.value,
        "metadata_kind": "outline",
    },
    "quiz": {"artifact_type": ArtifactType.EXERCISE.value},
    "summary": {"artifact_type": ArtifactType.SUMMARY.value},
    "animation": {
        "artifact_type": ArtifactType.HTML.value,
        "metadata_kind": "animation_storyboard",
    },
    "handout": {
        "artifact_type": ArtifactType.DOCX.value,
        "metadata_kind": "handout",
    },
}

WAVE1_ENTRY_ROUTE_MAPPING: dict[str, dict[str, str | bool]] = {
    "ppt": {"entry_route": "session-first", "session_required": True},
    "word": {"entry_route": "session-first", "session_required": True},
    "outline": {"entry_route": "session-first", "session_required": True},
    "summary": {"entry_route": "artifact-lite", "session_required": False},
}

ALL_PROJECT_CAPABILITIES: tuple[str, ...] = tuple(CAPABILITY_ARTIFACT_MAPPING.keys())


def normalize_artifact_type(artifact_type: ArtifactType | str) -> str:
    return (
        artifact_type.value
        if isinstance(artifact_type, ArtifactType)
        else str(artifact_type)
    )


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
    artifact_type: ArtifactType | str, artifact_id: str
) -> str:
    normalized = normalize_artifact_type(artifact_type)
    return f"{normalized}_{artifact_id}.{get_artifact_extension(normalized)}"
