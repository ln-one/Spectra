"""Spectra-local artifact file orchestration on top of remote Ourograph records."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
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


def _read_silent_accretion_timeout_seconds() -> float:
    try:
        return float(
            str(os.getenv("ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS", "8")).strip()
            or "8"
        )
    except ValueError:
        return 8.0


def _schedule_silent_accretion(
    *,
    service,
    artifact,
    project_id: str,
    artifact_type: str,
    visibility: str,
    session_id: Optional[str],
    based_on_version_id: Optional[str],
    normalized_content: dict[str, Any],
) -> None:
    timeout_seconds = _read_silent_accretion_timeout_seconds()

    async def _run() -> None:
        started_at = time.perf_counter()
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
            logger.info(
                "artifact_silent_accretion_completed artifact=%s project=%s artifact_type=%s duration_ms=%.2f",
                getattr(artifact, "id", None),
                project_id,
                artifact_type,
                (time.perf_counter() - started_at) * 1000,
            )
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

    asyncio.create_task(_run())


async def _generate_artifact_file(
    *,
    service,
    artifact_type: str,
    project_id: str,
    artifact_id: str,
    user_id: str,
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
            user_id=user_id,
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
    started_at = time.perf_counter()
    artifact_type = normalize_artifact_type(artifact_type)
    visibility = normalize_artifact_visibility(visibility).value
    artifact_id = str(uuid.uuid4())
    mode = normalize_artifact_mode(artifact_mode)
    based_on_version_id = await resolve_based_on_version_id(
        service=service,
        project_id=project_id,
        user_id=user_id,
        based_on_version_id=based_on_version_id,
    )
    normalized_content = normalize_artifact_content(artifact_type, content)

    replaced_artifact = None
    if mode == "replace":
        candidates = await service.get_project_artifacts(
            project_id,
            user_id=user_id,
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
        user_id=user_id,
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
        await service.update_artifact_metadata(
            replaced_artifact.id,
            replaced_metadata,
            project_id=project_id,
            user_id=user_id,
        )

    _schedule_silent_accretion(
        service=service,
        artifact=artifact,
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        normalized_content=normalized_content,
    )
    logger.info(
        "artifact_create_completed artifact=%s project=%s artifact_type=%s duration_ms=%.2f mode=%s",
        getattr(artifact, "id", None),
        project_id,
        artifact_type,
        (time.perf_counter() - started_at) * 1000,
        mode,
    )
    return artifact


async def update_artifact_with_file(
    *,
    service,
    artifact,
    project_id: str,
    user_id: str,
    content: Optional[dict] = None,
    based_on_version_id: Optional[str] = None,
):
    started_at = time.perf_counter()
    artifact_type = normalize_artifact_type(str(getattr(artifact, "type", "") or ""))
    visibility = normalize_artifact_visibility(
        str(getattr(artifact, "visibility", "") or "private")
    ).value
    artifact_id = str(getattr(artifact, "id", "") or "").strip()
    if not artifact_id:
        raise ValueError("update_artifact_with_file requires artifact.id")

    resolved_based_on_version_id = await resolve_based_on_version_id(
        service=service,
        project_id=project_id,
        user_id=user_id,
        based_on_version_id=(
            based_on_version_id
            if based_on_version_id is not None
            else getattr(artifact, "basedOnVersionId", None)
        ),
    )
    normalized_content = normalize_artifact_content(artifact_type, content)

    storage_path = await _generate_artifact_file(
        service=service,
        artifact_type=artifact_type,
        project_id=project_id,
        artifact_id=artifact_id,
        user_id=user_id,
        normalized_content=normalized_content,
    )
    existing_storage_path = str(getattr(artifact, "storagePath", "") or "").strip()
    if (
        storage_path
        and existing_storage_path
        and Path(storage_path).resolve() != Path(existing_storage_path).resolve()
    ):
        Path(existing_storage_path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(storage_path, existing_storage_path)
        storage_path = existing_storage_path
    existing_metadata = parse_artifact_metadata(getattr(artifact, "metadata", None))
    for stale_key in (
        "replaces_artifact_id",
        "superseded_by_artifact_id",
    ):
        existing_metadata.pop(stale_key, None)
    metadata = {
        **existing_metadata,
        **build_artifact_metadata(
            artifact_type,
            normalized_content,
            user_id,
            artifact_mode="update",
        ),
    }
    updated_artifact = await service.update_artifact_metadata(
        artifact_id,
        metadata,
        project_id=project_id,
        user_id=user_id,
    )
    setattr(updated_artifact, "metadata", metadata)

    current_based_on_version_id = getattr(updated_artifact, "basedOnVersionId", None)
    if (
        resolved_based_on_version_id
        and resolved_based_on_version_id != current_based_on_version_id
    ):
        updated_artifact = await service.bind_artifact_to_version(
            project_id=project_id,
            artifact_id=artifact_id,
            based_on_version_id=resolved_based_on_version_id,
            user_id=user_id,
        )

    if storage_path:
        setattr(updated_artifact, "storagePath", storage_path)
    setattr(updated_artifact, "sessionId", getattr(artifact, "sessionId", None))
    if (
        resolved_based_on_version_id
        and not getattr(updated_artifact, "basedOnVersionId", None)
    ):
        setattr(updated_artifact, "basedOnVersionId", resolved_based_on_version_id)

    _schedule_silent_accretion(
        service=service,
        artifact=updated_artifact,
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        session_id=getattr(artifact, "sessionId", None),
        based_on_version_id=resolved_based_on_version_id,
        normalized_content=normalized_content,
    )
    logger.info(
        "artifact_update_completed artifact=%s project=%s artifact_type=%s duration_ms=%.2f",
        artifact_id,
        project_id,
        artifact_type,
        (time.perf_counter() - started_at) * 1000,
    )

    return updated_artifact


__all__ = [
    "create_artifact_with_file",
    "generate_office_artifact_via_render_service",
    "get_artifact_storage_path",
    "update_artifact_with_file",
]
