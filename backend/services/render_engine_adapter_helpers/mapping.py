from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from services.render_engine_adapter_helpers.parsing import (
    build_page_markdown,
    parse_document_pages,
)


def extract_object_field(source: Any, key: str) -> Any:
    if isinstance(source, dict):
        return source.get(key)
    return getattr(source, key, None)


def serialize_model_like(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list, str, int, float, bool)):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return None


def serialize_page_class_plan(value: Any) -> Optional[list[dict[str, Any]]]:
    if not isinstance(value, list):
        return None
    serialized: list[dict[str, Any]] = []
    for item in value:
        normalized = serialize_model_like(item)
        if isinstance(normalized, dict):
            serialized.append(normalized)
    return serialized or None


def render_theme_config(
    template_config: Optional[dict],
    *,
    extra_css: Optional[str] = None,
) -> dict[str, Any]:
    style = "default"
    theme_id = "default"
    template_id = "document-teaching"
    if isinstance(template_config, dict):
        style = str(template_config.get("style") or "default").strip() or "default"
        explicit_template_id = str(template_config.get("template_id") or "").strip()
        if explicit_template_id:
            template_id = explicit_template_id
    if style and style != "teach":
        theme_id = style
    overrides: dict[str, Any] = {}
    if extra_css and str(extra_css).strip():
        overrides["custom_css"] = str(extra_css).strip()
    return {
        "theme_id": theme_id,
        "template_id": template_id,
        "overrides": overrides or None,
    }


def build_render_engine_input(
    courseware_content: Any,
    template_config: Optional[dict],
    output_targets: list[str],
    *,
    render_job_id: str,
    output_dir: Path,
) -> dict[str, Any]:
    title = ""
    markdown_content = ""
    render_markdown = ""
    lesson_plan_markdown = ""
    if isinstance(courseware_content, dict):
        title = str(courseware_content.get("title") or "").strip()
        markdown_content = str(courseware_content.get("markdown_content") or "")
        render_markdown = str(courseware_content.get("render_markdown") or "")
        lesson_plan_markdown = str(courseware_content.get("lesson_plan_markdown") or "")
    else:
        title = str(getattr(courseware_content, "title", "") or "").strip()
        markdown_content = str(
            getattr(courseware_content, "markdown_content", "") or ""
        )
        render_markdown = str(getattr(courseware_content, "render_markdown", "") or "")
        lesson_plan_markdown = str(
            getattr(courseware_content, "lesson_plan_markdown", "") or ""
        )

    style_manifest = serialize_model_like(
        extract_object_field(courseware_content, "style_manifest")
    )
    extra_css_value = extract_object_field(courseware_content, "extra_css")
    extra_css = str(extra_css_value or "").strip() if extra_css_value else ""
    page_class_plan = serialize_page_class_plan(
        extract_object_field(courseware_content, "page_class_plan")
    )

    source_markdown = render_markdown or markdown_content
    pages = parse_document_pages(source_markdown)
    render_theme = render_theme_config(template_config, extra_css=extra_css or None)
    return {
        "render_job_id": render_job_id,
        "output_targets": output_targets,
        "theme": render_theme["theme_id"],
        "output_dir": str(output_dir.resolve()),
        # Keep job rendering on the structured path so preview overflow splits and
        # export pagination are decided by the same canonical layout pipeline.
        "job_marp_markdown": None,
        "render": {
            "theme": render_theme,
            "template": {
                "template_id": render_theme["template_id"],
            },
            "outputs": output_targets,
        },
        "document": {
            "title": title or "Untitled Render Job",
            "pages": [
                {
                    **page,
                    "page_id": f"{render_job_id}-page-{index}",
                    "page_index": index,
                    "metadata": {
                        "source": "spectra-courseware",
                        "style_manifest": style_manifest,
                        "page_class_plan_item": (
                            page_class_plan[index]
                            if page_class_plan and index < len(page_class_plan)
                            else None
                        ),
                    },
                }
                for index, page in enumerate(pages)
            ],
            "lesson_plan_markdown": lesson_plan_markdown,
            "metadata": {
                "source": "spectra-courseware",
                "style_manifest": style_manifest,
            },
        },
        "render_hints": {
            "density": "density-medium",
        },
    }


def build_render_engine_page_input(
    *,
    render_job_id: str,
    page_id: str,
    page_index: int,
    page_payload: dict[str, Any],
    document_title: str,
    template_config: Optional[dict],
    output_dir: Path,
    style_manifest: Optional[dict] = None,
    extra_css: Optional[str] = None,
    page_class_plan: Optional[list[dict]] = None,
) -> dict[str, Any]:
    page_markdown = build_page_markdown(page_payload)
    render_theme = render_theme_config(template_config, extra_css=extra_css)
    return {
        "render_job_id": render_job_id,
        "page_id": page_id,
        "page_index": int(page_index),
        "document_title": document_title,
        "theme": render_theme["theme_id"],
        "output_dir": str(output_dir.resolve()),
        "page_marp_markdown": None,
        "render": {
            "theme": render_theme,
            "template": {
                "template_id": render_theme["template_id"],
            },
        },
        "page": {
            "page_id": page_id,
            "page_index": int(page_index),
            "title": page_payload.get("title"),
            "kind": str(page_payload.get("kind") or "content"),
            "layout": page_payload.get("layout"),
            "structure": page_payload.get("structure"),
            "layout_hints": page_payload.get("layout_hints"),
            "density": page_payload.get("density"),
            "blocks": list(page_payload.get("blocks") or []),
            "metadata": {
                "source": "spectra-courseware",
                "page_markdown": page_markdown,
                "style_manifest": style_manifest,
                "page_class_plan": page_class_plan,
            },
        },
        "document_title": document_title,
        "render_hints": {
            "density": str(page_payload.get("density") or "density-medium"),
        },
    }
