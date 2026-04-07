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
from services.render_engine_adapter import (
    build_render_engine_input,
    invoke_render_engine,
    normalize_render_engine_result,
)
from utils.exceptions import ValidationException

from .artifact_accretion import silently_accrete_artifact
from .artifact_content import build_artifact_metadata, normalize_artifact_content
from .artifact_semantics import (
    SUPPORTED_FILE_ARTIFACT_TYPES,
    normalize_artifact_type,
    normalize_artifact_visibility,
)
from .artifact_versioning import resolve_based_on_version_id

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


def _build_project_space_marp_markdown(content: Dict[str, Any], title: str) -> str:
    raw_markdown = str(content.get("markdown_content") or "").strip()
    if raw_markdown:
        return raw_markdown

    slides = content.get("slides")
    slide_items = slides if isinstance(slides, list) else []
    if not slide_items:
        slide_items = [{"title": title, "content": content.get("summary", "")}]

    blocks: list[str] = []
    for item in slide_items:
        slide_title = str(item.get("title") or title).strip()
        slide_content = str(
            item.get("content") or item.get("description") or item.get("summary") or ""
        ).strip()
        blocks.append(f"# {slide_title or title}")
        if slide_content:
            blocks.append(slide_content)
    return "\n\n---\n\n".join(part for part in blocks if part).strip()


def _build_project_space_doc_markdown(content: Dict[str, Any], title: str) -> str:
    lesson_plan_markdown = str(content.get("lesson_plan_markdown") or "").strip()
    if lesson_plan_markdown:
        return lesson_plan_markdown

    lines: list[str] = [f"# {title}"]
    summary = str(content.get("summary") or "").strip()
    if summary:
        lines.extend(["", summary])

    sections = content.get("sections")
    section_items = sections if isinstance(sections, list) else []
    for section in section_items:
        section_title = str(section.get("title") or "").strip()
        section_content = str(
            section.get("content")
            or section.get("description")
            or section.get("summary")
            or ""
        ).strip()
        if section_title:
            lines.extend(["", f"## {section_title}"])
        if section_content:
            lines.extend(["", section_content])
    return "\n".join(lines).strip()


async def _generate_office_artifact_via_render_service(
    *,
    artifact_type: str,
    project_id: str,
    artifact_id: str,
    normalized_content: Dict[str, Any],
) -> str:
    storage_path = artifact_generator.get_storage_path(
        project_id, artifact_type, artifact_id
    )
    title = str(
        normalized_content.get(
            "title",
            (
                "Project Space PPTX"
                if artifact_type == ArtifactType.PPTX.value
                else "Project Space DOCX"
            ),
        )
        or ""
    ).strip()
    payload = {
        "title": title or "Project Space Artifact",
        "markdown_content": _build_project_space_marp_markdown(
            normalized_content, title
        ),
        "lesson_plan_markdown": _build_project_space_doc_markdown(
            normalized_content, title
        ),
    }
    render_input = build_render_engine_input(
        payload,
        None,
        ["pptx"] if artifact_type == ArtifactType.PPTX.value else ["docx"],
        render_job_id=artifact_id,
    )
    render_input["output_dir"] = str(Path(storage_path).parent.resolve())
    render_result = await invoke_render_engine(render_input)
    normalized_result = normalize_render_engine_result(render_result)
    artifact_paths = normalized_result.get("artifact_paths") or {}
    actual_path = (
        artifact_paths.get("pptx")
        if artifact_type == ArtifactType.PPTX.value
        else artifact_paths.get("docx")
    )
    actual_path = str(actual_path or "").strip()
    if not actual_path:
        raise RuntimeError(f"render_engine_missing_{artifact_type}_artifact")
    return actual_path


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

    based_on_version_id = await resolve_based_on_version_id(
        db=db,
        project_id=project_id,
        based_on_version_id=based_on_version_id,
    )

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
            actual_path = await _generate_office_artifact_via_render_service(
                artifact_type=artifact_type,
                project_id=project_id,
                artifact_id=artifact_id,
                normalized_content=normalized_content,
            )
        elif artifact_type == ArtifactType.DOCX.value:
            actual_path = await _generate_office_artifact_via_render_service(
                artifact_type=artifact_type,
                project_id=project_id,
                artifact_id=artifact_id,
                normalized_content=normalized_content,
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
            actual_path = await artifact_generator.generate_video(
                normalized_content,
                project_id,
                artifact_id,
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
