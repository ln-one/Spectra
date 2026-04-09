"""Spectra-local artifact file orchestration on top of remote Ourograph records."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from schemas.project_space import ArtifactType
from services.artifact_generator import artifact_generator
from services.render_engine_adapter import (
    build_render_engine_input,
    invoke_render_engine,
    normalize_render_engine_result,
)
from utils.exceptions import ConflictException, ValidationException

from .artifact_accretion import silently_accrete_artifact
from .artifact_content import build_artifact_metadata, normalize_artifact_content
from .artifact_semantics import (
    SUPPORTED_FILE_ARTIFACT_TYPES,
    normalize_artifact_type,
    normalize_artifact_visibility,
)

logger = logging.getLogger(__name__)

_SUPPORTED_ARTIFACT_MODES = {"create", "replace"}


def normalize_artifact_mode(mode: Optional[str]) -> str:
    normalized = str(mode or "create").strip().lower()
    if normalized not in _SUPPORTED_ARTIFACT_MODES:
        raise ValidationException(
            f"Unsupported artifact mode '{normalized}'. "
            f"Supported modes: {', '.join(sorted(_SUPPORTED_ARTIFACT_MODES))}"
        )
    return normalized


def parse_artifact_metadata(raw_metadata: Any) -> dict[str, Any]:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
        except json.JSONDecodeError:
            logger.warning("artifact metadata is not valid JSON during replace flow")
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def is_current_artifact(artifact: Any) -> bool:
    metadata = parse_artifact_metadata(getattr(artifact, "metadata", None))
    return bool(metadata.get("is_current", True))


def select_replaced_artifact(
    candidates: list[Any], *, based_on_version_id: Optional[str]
):
    if not candidates:
        return None
    if based_on_version_id:
        matched = [
            artifact
            for artifact in candidates
            if getattr(artifact, "basedOnVersionId", None) == based_on_version_id
        ]
        current_matched = [
            artifact for artifact in matched if is_current_artifact(artifact)
        ]
        if current_matched:
            return current_matched[0]
        if matched:
            return matched[0]
    current_candidates = [
        artifact for artifact in candidates if is_current_artifact(artifact)
    ]
    if current_candidates:
        return current_candidates[0]
    return candidates[0]


async def resolve_based_on_version_id(
    *,
    service,
    project_id: str,
    based_on_version_id: Optional[str],
) -> Optional[str]:
    if based_on_version_id:
        version, _ = await service.get_project_version_with_context(
            project_id,
            based_on_version_id,
        )
        if not version or getattr(version, "projectId", None) != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} is invalid for project {project_id}"
            )
        return based_on_version_id

    current_version_id = await service.get_project_current_version_id(project_id)
    if not current_version_id:
        return None

    version, _ = await service.get_project_version_with_context(
        project_id, current_version_id
    )
    if not version or getattr(version, "projectId", None) != project_id:
        raise ConflictException(
            "Project current version anchor is invalid or no longer "
            "belongs to the project."
        )
    return current_version_id


def get_artifact_storage_path(
    project_id: str, artifact_type: str, artifact_id: str
) -> str:
    return artifact_generator.get_storage_path(project_id, artifact_type, artifact_id)


def build_project_space_marp_markdown(content: dict[str, Any], title: str) -> str:
    raw_markdown = str(content.get("markdown_content") or "").strip()
    if raw_markdown:
        return raw_markdown

    page_items = content.get("pages") if isinstance(content.get("pages"), list) else []
    if not page_items:
        page_items = (
            content.get("slides") if isinstance(content.get("slides"), list) else []
        )
    if not page_items:
        page_items = [{"title": title, "content": content.get("summary", "")}]

    blocks: list[str] = []
    for item in page_items:
        page_title = str(item.get("title") or title).strip()
        page_content = str(
            item.get("content") or item.get("description") or item.get("summary") or ""
        ).strip()
        blocks.append(f"# {page_title or title}")
        if page_content:
            blocks.append(page_content)
    return "\n\n---\n\n".join(part for part in blocks if part).strip()


def build_project_space_doc_markdown(content: dict[str, Any], title: str) -> str:
    lesson_plan_markdown = str(content.get("lesson_plan_markdown") or "").strip()
    if lesson_plan_markdown:
        return lesson_plan_markdown

    lines: list[str] = [f"# {title}"]
    summary = str(content.get("summary") or "").strip()
    if summary:
        lines.extend(["", summary])

    section_items = (
        content.get("sections") if isinstance(content.get("sections"), list) else []
    )
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


async def generate_office_artifact_via_render_service(
    *,
    artifact_type: str,
    project_id: str,
    artifact_id: str,
    normalized_content: dict[str, Any],
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
        "markdown_content": build_project_space_marp_markdown(
            normalized_content, title
        ),
        "lesson_plan_markdown": build_project_space_doc_markdown(
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


async def _generate_artifact_file(
    *,
    artifact_type: str,
    project_id: str,
    artifact_id: str,
    normalized_content: dict[str, Any],
) -> str:
    if artifact_type not in SUPPORTED_FILE_ARTIFACT_TYPES:
        return ""
    if artifact_type in {ArtifactType.PPTX.value, ArtifactType.DOCX.value}:
        return await generate_office_artifact_via_render_service(
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

    metadata = build_artifact_metadata(
        artifact_type,
        normalized_content,
        user_id,
        artifact_mode=mode,
    )
    if replaced_artifact is not None:
        metadata["replaces_artifact_id"] = replaced_artifact.id

    storage_path = await _generate_artifact_file(
        artifact_type=artifact_type,
        project_id=project_id,
        artifact_id=artifact_id,
        normalized_content=normalized_content,
    )
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
    "build_render_engine_input",
    "create_artifact_with_file",
    "generate_office_artifact_via_render_service",
    "get_artifact_storage_path",
    "invoke_render_engine",
    "normalize_render_engine_result",
]
