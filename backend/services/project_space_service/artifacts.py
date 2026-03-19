"""Artifact helpers for Project Space service."""

import html
import logging
import uuid
from typing import Any, Dict, Optional

from services.artifact_generator import artifact_generator
from utils.exceptions import ValidationException

from .artifact_semantics import (
    SUPPORTED_FILE_ARTIFACT_TYPES,
    get_artifact_capability,
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


def default_artifact_content(artifact_type: str) -> Dict[str, Any]:
    if artifact_type == "pptx":
        return {"title": "PPT demo", "slides": []}
    if artifact_type == "docx":
        return {"title": "Teaching handout", "sections": []}
    if artifact_type == "mindmap":
        return {"title": "Mindmap", "nodes": []}
    if artifact_type == "summary":
        return {"title": "Course summary", "summary": "", "key_points": []}
    if artifact_type == "exercise":
        return {"title": "Exercise", "questions": []}
    if artifact_type == "html":
        return {"html": "<html><body>Empty</body></html>"}
    if artifact_type == "gif":
        return {"title": "Animation placeholder", "scenes": []}
    if artifact_type == "mp4":
        return {"title": "Video placeholder"}
    return {"title": f"{artifact_type} artifact", "data": []}


def normalize_artifact_content(
    artifact_type: str,
    content: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    normalized = default_artifact_content(artifact_type)
    incoming = dict(content or {})
    normalized.update(incoming)

    mode = str(incoming.get("mode") or "").strip().lower()
    if artifact_type == "summary" and mode == "outline":
        normalized.setdefault("title", "课程大纲")
        normalized["kind"] = "outline"
        normalized["nodes"] = normalized.get("nodes") or []
    elif artifact_type == "docx" and mode == "handout":
        normalized.setdefault("title", "教学讲义")
        normalized["kind"] = "handout"
    elif artifact_type == "html" and mode == "animation_storyboard":
        normalized.setdefault("title", "Animation Storyboard")
        normalized["kind"] = "animation_storyboard"
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
    artifact_type = (
        artifact_type.value if hasattr(artifact_type, "value") else str(artifact_type)
    )
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
        if artifact_type == "pptx":
            actual_path = await artifact_generator.generate_pptx(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == "docx":
            actual_path = await artifact_generator.generate_docx(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == "mindmap":
            actual_path = await artifact_generator.generate_mindmap(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == "summary":
            actual_path = await artifact_generator.generate_summary(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == "exercise":
            actual_path = await artifact_generator.generate_quiz(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == "html":
            actual_path = await artifact_generator.generate_html(
                normalized_content.get("html", "<html><body>Empty</body></html>"),
                project_id,
                artifact_id,
            )
        elif artifact_type == "gif":
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
