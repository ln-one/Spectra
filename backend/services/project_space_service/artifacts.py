"""Spectra-local artifact file orchestration on top of remote Ourograph records."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Any, Optional

from schemas.project_space import ArtifactType
from services.artifact_generator import artifact_generator

from .artifact_accretion import silently_accrete_artifact
from .artifact_content import build_artifact_metadata, normalize_artifact_content
from .artifact_modes import (
    normalize_artifact_mode,
    parse_artifact_metadata,
    select_replaced_artifact,
)
from .artifact_rendering import (
    generate_office_artifact_via_render_service,
    get_artifact_storage_path,
)
from .artifact_semantics import (
    SUPPORTED_FILE_ARTIFACT_TYPES,
    normalize_artifact_type,
    normalize_artifact_visibility,
)
from .artifact_versions import resolve_based_on_version_id

logger = logging.getLogger(__name__)


async def _generate_artifact_file(
    *,
    service,
    artifact_type: str,
    project_id: str,
    artifact_id: str,
    normalized_content: dict[str, Any],
) -> str:
    if artifact_type not in SUPPORTED_FILE_ARTIFACT_TYPES:
        return ""
    if artifact_type in {ArtifactType.PPTX.value, ArtifactType.DOCX.value}:
        return await generate_office_artifact_via_render_service(
            service=service,
            artifact_type=artifact_type,
            project_id=project_id,
            artifact_id=artifact_id,
            normalized_content=normalized_content,
        )
    if artifact_type == ArtifactType.MINDMAP.value:
        return await artifact_generator.generate_mindmap(
            normalized_content, project_id, artifact_id
        )
    if artifact_type == ArtifactType.SUMMARY.value:
        return await artifact_generator.generate_summary(
            normalized_content, project_id, artifact_id
        )
    if artifact_type == ArtifactType.EXERCISE.value:
        return await artifact_generator.generate_quiz(
            normalized_content, project_id, artifact_id
        )
    if artifact_type == ArtifactType.HTML.value:
        return await artifact_generator.generate_html(
            normalized_content.get("html", "<html><body>Empty</body></html>"),
            project_id,
            artifact_id,
        )
    if artifact_type == ArtifactType.GIF.value:
        return await artifact_generator.generate_animation(
            normalized_content, project_id, artifact_id
        )
    return await artifact_generator.generate_video(
        normalized_content, project_id, artifact_id
    )


async def create_artifact_with_file(
    *,
    service,
    project_id: str,
    artifact_type: str,
    visibility: str,
    user_id: str,
    session_id: Optional[str] = None,
    based_on_version_id: Optional[str] = None,
    content: Optional[dict] = None,
    artifact_mode: Optional[str] = None,
):
    artifact_type = normalize_artifact_type(artifact_type)
    visibility = normalize_artifact_visibility(visibility).value
    artifact_id = str(uuid.uuid4())
    mode = normalize_artifact_mode(artifact_mode)
    based_on_version_id = await resolve_based_on_version_id(
        service=service,
        project_id=project_id,
        based_on_version_id=based_on_version_id,
    )
    normalized_content = normalize_artifact_content(artifact_type, content)

    replaced_artifact = None
    if mode == "replace":
        candidates = await service.get_project_artifacts(
            project_id,
            type_filter=artifact_type,
            visibility_filter=visibility,
            owner_user_id_filter=user_id,
            based_on_version_id_filter=None,
            session_id_filter=session_id,
        )
        replaced_artifact = select_replaced_artifact(
            list(candidates),
            based_on_version_id=based_on_version_id,
        )

    storage_path = await _generate_artifact_file(
        service=service,
        artifact_type=artifact_type,
        project_id=project_id,
        artifact_id=artifact_id,
        normalized_content=normalized_content,
    )
    metadata = build_artifact_metadata(
        artifact_type,
        normalized_content,
        user_id,
        artifact_mode=mode,
    )
    if replaced_artifact is not None:
        metadata["replaces_artifact_id"] = replaced_artifact.id
    artifact = await service.create_artifact(
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        user_id=user_id,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        storage_path=storage_path,
        metadata=metadata,
    )

    if mode == "replace" and replaced_artifact is not None:
        replaced_metadata = parse_artifact_metadata(
            getattr(replaced_artifact, "metadata", None)
        )
        replaced_metadata["is_current"] = False
        replaced_metadata["superseded_by_artifact_id"] = artifact.id
        await service.update_artifact_metadata(replaced_artifact.id, replaced_metadata)

    try:
        timeout_seconds = float(
            str(os.getenv("ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS", "8")).strip()
            or "8"
        )
    except ValueError:
        timeout_seconds = 8.0

    try:
        coroutine = silently_accrete_artifact(
            db=service.db,
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
            "artifact_silent_accretion_timeout artifact=%s project=%s timeout=%s",
            getattr(artifact, "id", None),
            project_id,
            timeout_seconds,
        )
    except Exception as exc:
        logger.warning(
            "artifact_silent_accretion_failed artifact=%s project=%s error=%s",
            getattr(artifact, "id", None),
            project_id,
            exc,
            exc_info=True,
        )
    return artifact


__all__ = [
    "create_artifact_with_file",
    "generate_office_artifact_via_render_service",
    "get_artifact_storage_path",
]
