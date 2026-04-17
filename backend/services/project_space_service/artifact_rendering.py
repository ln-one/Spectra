"""Pagevra-facing render helpers for project-space file creation."""

from __future__ import annotations

import json
from pathlib import Path

from schemas.project_space import ArtifactType
from services.artifact_generator import artifact_generator
from services.render_engine_adapter import (
    build_render_engine_input,
    invoke_render_engine,
    normalize_render_engine_result,
)


def get_artifact_storage_path(
    project_id: str, artifact_type: str, artifact_id: str
) -> str:
    return artifact_generator.get_storage_path(project_id, artifact_type, artifact_id)


def build_project_space_marp_markdown(content: dict[str, object], title: str) -> str:
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
        if not isinstance(item, dict):
            continue
        page_title = str(item.get("title") or title).strip()
        page_content = str(
            item.get("content") or item.get("description") or item.get("summary") or ""
        ).strip()
        blocks.append(f"# {page_title or title}")
        if page_content:
            blocks.append(page_content)
    return "\n\n---\n\n".join(part for part in blocks if part).strip()


def build_project_space_doc_markdown(content: dict[str, object], title: str) -> str:
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
        if not isinstance(section, dict):
            continue
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


def _read_source_artifact_id(content: dict[str, object]) -> str:
    for key in ("source_artifact_id", "artifact_id"):
        value = str(content.get(key) or "").strip()
        if value:
            return value
    anchor = content.get("artifact_anchor")
    if isinstance(anchor, dict):
        value = str(anchor.get("artifact_id") or "").strip()
        if value:
            return value
    metadata = content.get("metadata")
    if isinstance(metadata, dict):
        value = str(metadata.get("source_artifact_id") or "").strip()
        if value:
            return value
    elif isinstance(metadata, str) and metadata.strip():
        try:
            parsed = json.loads(metadata)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            value = str(parsed.get("source_artifact_id") or "").strip()
            if value:
                return value
    return ""


async def _resolve_authority_storage_path(
    *,
    service,
    artifact_type: str,
    normalized_content: dict[str, object],
) -> str:
    if service is None:
        return ""
    source_artifact_id = _read_source_artifact_id(normalized_content)
    if not source_artifact_id:
        return ""
    artifact = await service.get_artifact(source_artifact_id)
    if not artifact:
        return ""
    resolved_type = str(getattr(artifact, "type", "") or "").strip().lower()
    if resolved_type != str(artifact_type).strip().lower():
        return ""
    storage_path = str(getattr(artifact, "storagePath", "") or "").strip()
    return storage_path


async def generate_office_artifact_via_render_service(
    *,
    service=None,
    artifact_type: str,
    project_id: str,
    artifact_id: str,
    normalized_content: dict[str, object],
) -> str:
    authority_storage_path = await _resolve_authority_storage_path(
        service=service,
        artifact_type=artifact_type,
        normalized_content=normalized_content,
    )
    if authority_storage_path:
        return authority_storage_path

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
