"""Artifact helpers for Project Space service."""

import html
import logging
import uuid
from typing import Any, Dict, Optional

from schemas.project_space import ArtifactType
from services.artifact_generator import artifact_generator
from utils.exceptions import ValidationException

from .artifact_semantics import (
    ARTIFACT_MODE_KIND_MAP,
    SUPPORTED_FILE_ARTIFACT_TYPES,
    ArtifactMetadataKind,
    default_artifact_content,
    get_artifact_capability,
    normalize_artifact_type,
    normalize_artifact_visibility,
)

logger = logging.getLogger(__name__)


def _build_animation_storyboard_html(content: Dict[str, Any]) -> str:
    title = html.escape(content.get("title", "Animation Storyboard"))
    scenes = content.get("scenes") or [
        {
            "title": "Scene 1",
            "description": content.get("summary") or "待补充镜头说明",
        }
    ]
    scene_blocks = []
    for idx, scene in enumerate(scenes, start=1):
        scene_title = html.escape(str(scene.get("title") or f"Scene {idx}"))
        scene_description = html.escape(str(scene.get("description") or ""))
        scene_blocks.append(
            "<section>"
            f"<h2>Scene {idx}: {scene_title}</h2>"
            f"<p>{scene_description}</p>"
            "</section>"
        )
    return (
        "<!doctype html><html><body>"
        f"<h1>{title}</h1>" + "".join(scene_blocks) + "</body></html>"
    )


def normalize_artifact_content(
    artifact_type: str,
    content: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    normalized = default_artifact_content(artifact_type)
    incoming = dict(content or {})
    normalized.update(incoming)

    mode = str(incoming.get("mode") or "").strip().lower()
    title_and_kind = ARTIFACT_MODE_KIND_MAP.get((artifact_type, mode))
    if title_and_kind:
        title, kind = title_and_kind
        normalized.setdefault("title", title)
        normalized["kind"] = kind

    if (
        artifact_type == ArtifactType.SUMMARY.value
        and mode == ArtifactMetadataKind.OUTLINE.value
    ):
        normalized["nodes"] = normalized.get("nodes") or []
    elif (
        artifact_type == ArtifactType.HTML.value
        and mode == ArtifactMetadataKind.ANIMATION_STORYBOARD.value
    ):
        normalized["html"] = incoming.get("html") or _build_animation_storyboard_html(
            normalized
        )
    return normalized


def build_artifact_metadata(
    artifact_type: str,
    content: Dict[str, Any],
    user_id: str,
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {
        "created_by": user_id,
        "capability": get_artifact_capability(artifact_type),
    }
    kind = str(content.get("kind") or "").strip()
    if kind:
        metadata["kind"] = kind
    title = content.get("title")
    if isinstance(title, str) and title.strip():
        metadata["title"] = title.strip()
    return metadata


async def get_artifact_storage_path(
    project_id: str, artifact_type: str, artifact_id: str
) -> str:
    """Generate storage path for an artifact."""
    return artifact_generator.get_storage_path(project_id, artifact_type, artifact_id)


async def create_artifact_with_file(
    db,
    project_id: str,
    artifact_type: str,
    visibility: str,
    user_id: str,
    session_id: Optional[str] = None,
    based_on_version_id: Optional[str] = None,
    content: Optional[Dict[str, Any]] = None,
) -> Any:
    """Create artifact record and generate the backing file."""
    artifact_type = normalize_artifact_type(artifact_type)
    visibility = normalize_artifact_visibility(visibility).value
    artifact_id = str(uuid.uuid4())
    storage_path = artifact_generator.get_storage_path(
        project_id, artifact_type, artifact_id
    )

    if based_on_version_id:
        version = await db.get_project_version(based_on_version_id)
        if not version or version.projectId != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} is invalid for project {project_id}"
            )

    normalized_content = normalize_artifact_content(artifact_type, content)

    if artifact_type not in SUPPORTED_FILE_ARTIFACT_TYPES:
        raise ValidationException(
            f"Artifact type '{artifact_type}' file generation not yet supported. "
            f"Supported types: {', '.join(SUPPORTED_FILE_ARTIFACT_TYPES)}"
        )

    try:
        if artifact_type == ArtifactType.PPTX.value:
            actual_path = await artifact_generator.generate_pptx(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.DOCX.value:
            actual_path = await artifact_generator.generate_docx(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.MINDMAP.value:
            actual_path = await artifact_generator.generate_mindmap(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.SUMMARY.value:
            actual_path = await artifact_generator.generate_summary(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.EXERCISE.value:
            actual_path = await artifact_generator.generate_quiz(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.HTML.value:
            actual_path = await artifact_generator.generate_html(
                normalized_content.get("html", "<html><body>Empty</body></html>"),
                project_id,
                artifact_id,
            )
        elif artifact_type == ArtifactType.GIF.value:
            actual_path = await artifact_generator.generate_animation(
                normalized_content, project_id, artifact_id
            )
        else:
            actual_path = await artifact_generator.generate_video_placeholder(
                project_id, artifact_id
            )
        storage_path = actual_path
    except Exception as exc:
        logger.error(f"Failed to generate artifact file: {exc}")
        raise

    return await db.create_artifact(
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        owner_user_id=user_id,
        storage_path=storage_path,
        metadata=build_artifact_metadata(artifact_type, normalized_content, user_id),
    )
