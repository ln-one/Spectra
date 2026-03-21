"""Artifact creation helpers for Project Space service."""

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from schemas.project_space import ArtifactType
from services.artifact_generator import artifact_generator
from services.rag_service import rag_service
from utils.exceptions import ValidationException

from .artifact_accretion import silently_accrete_artifact
from .artifact_content import build_artifact_metadata, normalize_artifact_content
from .artifact_semantics import (
    SUPPORTED_FILE_ARTIFACT_TYPES,
    normalize_artifact_type,
    normalize_artifact_visibility,
)

logger = logging.getLogger(__name__)

_SUPPORTED_ARTIFACT_MODES = {"create", "replace"}


def _normalize_artifact_mode(mode: Optional[str]) -> str:
    mode = str(mode or "create").strip().lower()
    if mode not in _SUPPORTED_ARTIFACT_MODES:
        raise ValidationException(
            f"Unsupported artifact mode '{mode}'. "
            f"Supported modes: {', '.join(sorted(_SUPPORTED_ARTIFACT_MODES))}"
        )
    return mode


def _parse_artifact_metadata(raw_metadata: Any) -> Dict[str, Any]:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            logger.warning("artifact metadata is not valid JSON during replace flow")
    return {}


def _is_current_artifact(artifact: Any) -> bool:
    metadata = _parse_artifact_metadata(getattr(artifact, "metadata", None))
    return bool(metadata.get("is_current", True))


def _select_replaced_artifact(
    candidates: list[Any],
    *,
    based_on_version_id: Optional[str],
) -> Any | None:
    if not candidates:
        return None

    if based_on_version_id:
        version_matched = [
            artifact
            for artifact in candidates
            if getattr(artifact, "basedOnVersionId", None) == based_on_version_id
        ]
        current_version_matched = [
            artifact for artifact in version_matched if _is_current_artifact(artifact)
        ]
        if current_version_matched:
            return current_version_matched[0]
        if version_matched:
            return version_matched[0]

    current_candidates = [
        artifact for artifact in candidates if _is_current_artifact(artifact)
    ]
    if current_candidates:
        return current_candidates[0]

    return candidates[0]


async def _silently_accrete_artifact(
    *,
    db,
    artifact,
    project_id: str,
    artifact_type: str,
    visibility: str,
    session_id: Optional[str],
    based_on_version_id: Optional[str],
    normalized_content: Dict[str, Any],
) -> None:
    await silently_accrete_artifact(
        db=db,
        artifact=artifact,
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        normalized_content=normalized_content,
        path_cls=Path,
        rag_indexer=rag_service,
    )


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
    artifact_mode: Optional[str] = None,
) -> Any:
    """Create artifact record and generate the backing file."""
    artifact_type = normalize_artifact_type(artifact_type)
    visibility = normalize_artifact_visibility(visibility).value
    artifact_id = str(uuid.uuid4())
    storage_path = ""

    mode = _normalize_artifact_mode(artifact_mode)

    if based_on_version_id:
        version = await db.get_project_version(based_on_version_id)
        if not version or version.projectId != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} is invalid for project {project_id}"
            )
    else:
        project = await db.get_project(project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        if current_version_id:
            based_on_version_id = current_version_id

    normalized_content = normalize_artifact_content(artifact_type, content)

    replaced_artifact = None
    if mode == "replace":
        candidates = await db.get_project_artifacts(
            project_id,
            type_filter=artifact_type,
            visibility_filter=visibility,
            owner_user_id_filter=user_id,
            based_on_version_id_filter=None,
            session_id_filter=session_id,
        )
        replaced_artifact = _select_replaced_artifact(
            list(candidates or []),
            based_on_version_id=based_on_version_id,
        )

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

    metadata = build_artifact_metadata(
        artifact_type,
        normalized_content,
        user_id,
        artifact_mode=mode,
    )
    if replaced_artifact is not None:
        metadata["replaces_artifact_id"] = replaced_artifact.id

    artifact = await db.create_artifact(
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        owner_user_id=user_id,
        storage_path=storage_path,
        metadata=metadata,
    )
    if replaced_artifact is not None and hasattr(db, "update_artifact_metadata"):
        replaced_metadata = _parse_artifact_metadata(
            getattr(replaced_artifact, "metadata", None)
        )
        replaced_metadata["superseded_by_artifact_id"] = artifact.id
        replaced_metadata["is_current"] = False
        await db.update_artifact_metadata(replaced_artifact.id, replaced_metadata)
    try:
        timeout_seconds = 8.0
        raw_timeout = os.getenv(
            "ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS",
            "8",
        ).strip()
        if raw_timeout:
            try:
                timeout_seconds = float(raw_timeout)
            except ValueError:
                timeout_seconds = 8.0
        coroutine = _silently_accrete_artifact(
            db=db,
            artifact=artifact,
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            normalized_content=normalized_content,
        )
        if timeout_seconds > 0:
            await asyncio.wait_for(coroutine, timeout=timeout_seconds)
        else:
            await coroutine
    except asyncio.TimeoutError:
        logger.warning(
            "artifact_silent_accretion_timeout: artifact=%s project=%s timeout=%s",
            getattr(artifact, "id", None),
            project_id,
            timeout_seconds,
        )
    except Exception as exc:
        logger.warning(
            "artifact_silent_accretion_failed: artifact=%s project=%s error=%s",
            getattr(artifact, "id", None),
            project_id,
            exc,
            exc_info=True,
        )
    return artifact
