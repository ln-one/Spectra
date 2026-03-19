"""Shared artifact semantics for Project Space and generation flows."""

from __future__ import annotations

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


def normalize_artifact_type(artifact_type: ArtifactType | str) -> str:
    return (
        artifact_type.value
        if isinstance(artifact_type, ArtifactType)
        else str(artifact_type)
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


def build_artifact_download_filename(
    artifact_type: ArtifactType | str, artifact_id: str
) -> str:
    normalized = normalize_artifact_type(artifact_type)
    return f"{normalized}_{artifact_id}.{get_artifact_extension(normalized)}"
