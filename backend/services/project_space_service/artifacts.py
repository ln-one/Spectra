"""Artifact helpers for Project Space service."""

import logging
import uuid
from typing import Any, Dict, Optional

from services.artifact_generator import artifact_generator
from utils.exceptions import ValidationException

logger = logging.getLogger(__name__)


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

    if content is None:
        content = default_artifact_content(artifact_type)

    supported_types = [
        "pptx",
        "docx",
        "mindmap",
        "summary",
        "exercise",
        "html",
        "gif",
        "mp4",
    ]
    if artifact_type not in supported_types:
        raise ValidationException(
            f"Artifact type '{artifact_type}' file generation not yet supported. "
            f"Supported types: {', '.join(supported_types)}"
        )

    try:
        if artifact_type == "pptx":
            actual_path = await artifact_generator.generate_pptx(
                content, project_id, artifact_id
            )
        elif artifact_type == "docx":
            actual_path = await artifact_generator.generate_docx(
                content, project_id, artifact_id
            )
        elif artifact_type == "mindmap":
            actual_path = await artifact_generator.generate_mindmap(
                content, project_id, artifact_id
            )
        elif artifact_type == "summary":
            actual_path = await artifact_generator.generate_summary(
                content, project_id, artifact_id
            )
        elif artifact_type == "exercise":
            actual_path = await artifact_generator.generate_quiz(
                content, project_id, artifact_id
            )
        elif artifact_type == "html":
            html_content = content.get("html", "<html><body>Empty</body></html>")
            actual_path = await artifact_generator.generate_html(
                html_content, project_id, artifact_id
            )
        elif artifact_type == "gif":
            actual_path = await artifact_generator.generate_animation(
                content, project_id, artifact_id
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
        metadata={"created_by": user_id},
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
