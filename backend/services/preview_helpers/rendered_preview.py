from __future__ import annotations

import base64
import logging
import struct
from pathlib import Path
from typing import Awaitable, Callable, Optional

from services.generation.marp_document import split_marp_document
from services.preview_helpers.rendering import build_slides
from services.preview_helpers.slide_mapping import slide_identity
from services.render_engine_adapter import (
    build_render_engine_input,
    build_render_engine_page_input,
    invoke_render_engine_page,
    normalize_render_engine_page_result,
)

logger = logging.getLogger(__name__)


def _read_png_dimensions(image_path: Path) -> tuple[Optional[int], Optional[int]]:
    try:
        with image_path.open("rb") as fh:
            header = fh.read(24)
        if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
            return None, None
        width, height = struct.unpack(">II", header[16:24])
        return int(width), int(height)
    except Exception:
        return None, None


def _to_data_url(image_path: Path) -> str:
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _assemble_resolved_markdown(markdown_fragments: list[tuple[int, str]]) -> str:
    if not markdown_fragments:
        return ""

    frontmatter = ""
    style_blocks = ""
    slides: list[str] = []

    for _, fragment in sorted(markdown_fragments, key=lambda item: item[0]):
        raw = str(fragment or "").strip()
        if not raw:
            continue
        current_frontmatter, current_style_blocks, current_slides = split_marp_document(
            raw
        )
        current_slides = [slide.strip() for slide in current_slides if slide.strip()]
        if not current_slides:
            continue
        if not slides:
            frontmatter = current_frontmatter.strip()
            style_blocks = current_style_blocks.strip()
        slides.extend(current_slides)

    if not slides:
        return ""

    body_parts: list[str] = []
    first_slide = slides[0]
    if style_blocks:
        first_slide = "\n\n".join([style_blocks, first_slide]).strip()
    body_parts.append(first_slide)
    body_parts.extend(slides[1:])

    body = "\n\n---\n\n".join(part for part in body_parts if part).strip()
    if frontmatter and body:
        return f"{frontmatter}\n\n{body}\n"
    if frontmatter:
        return f"{frontmatter}\n"
    if body:
        return f"{body}\n"
    return ""


async def build_rendered_preview_payload(
    *,
    task_id: str,
    title: str,
    markdown_content: str,
    template_config: Optional[dict] = None,
    slide_ids: Optional[list[str]] = None,
    render_markdown: Optional[str] = None,
    style_manifest: Optional[dict] = None,
    extra_css: Optional[str] = None,
    page_class_plan: Optional[list[dict]] = None,
    on_page_rendered: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> Optional[dict]:
    if not str(markdown_content or "").strip():
        return None

    slide_models = build_slides(
        task_id,
        markdown_content,
        image_metadata=None,
        render_markdown=render_markdown,
    )
    structured_document = (
        build_render_engine_input(
            {
                "title": title or "课件预览",
                "markdown_content": markdown_content,
                "lesson_plan_markdown": "",
                "render_markdown": render_markdown,
                "style_manifest": style_manifest,
                "extra_css": extra_css,
                "page_class_plan": page_class_plan,
            },
            template_config,
            ["preview"],
            render_job_id=task_id,
        ).get("document")
        or {}
    )
    structured_pages = structured_document.get("pages") or []

    pages: list[dict] = []
    html_success_count = 0
    markdown_fragments: list[tuple[int, str]] = []
    for index, page_payload in enumerate(structured_pages):
        if not isinstance(page_payload, dict):
            continue
        page_id = (
            slide_ids[index]
            if slide_ids and index < len(slide_ids) and slide_ids[index]
            else slide_identity(
                slide_models[index] if index < len(slide_models) else None,
                index,
                task_id=task_id,
            )
        )
        try:
            render_input = build_render_engine_page_input(
                render_job_id=task_id,
                page_id=page_id,
                page_index=index,
                page_payload=page_payload,
                document_title=title or "课件预览",
                template_config=template_config,
                style_manifest=style_manifest,
                extra_css=extra_css,
                page_class_plan=page_class_plan,
            )
            render_result = await invoke_render_engine_page(render_input)
            normalized = normalize_render_engine_page_result(render_result)
            normalized_markdown = normalized.get("markdown")
            if isinstance(normalized_markdown, str) and normalized_markdown.strip():
                markdown_fragments.append((index, normalized_markdown))
            html_previews = [
                item
                for item in (normalized.get("html_previews") or [])
                if isinstance(item, str) and item.strip()
            ]
            preview_image_paths = [
                item
                for item in (normalized.get("preview_image_paths") or [])
                if isinstance(item, str) and item.strip()
            ]
            single_html_preview = normalized.get("html_preview")
            if (
                isinstance(single_html_preview, str)
                and single_html_preview.strip()
                and not html_previews
            ):
                html_previews = [single_html_preview]
            single_preview_image_path = normalized.get("preview_image_path")
            if (
                isinstance(single_preview_image_path, str)
                and single_preview_image_path.strip()
                and not preview_image_paths
            ):
                preview_image_paths = [single_preview_image_path]

            split_count = max(len(html_previews), len(preview_image_paths), 0)
            if split_count == 0:
                continue

            html_success_count += split_count
            for split_index in range(split_count):
                image_url = None
                width = None
                height = None
                preview_image_path = (
                    preview_image_paths[split_index]
                    if split_index < len(preview_image_paths)
                    else None
                )
                if isinstance(preview_image_path, str) and preview_image_path.strip():
                    image_path = Path(preview_image_path)
                    if image_path.exists():
                        image_url = _to_data_url(image_path)
                        width, height = _read_png_dimensions(image_path)
                html_preview = (
                    html_previews[split_index]
                    if split_index < len(html_previews)
                    else None
                )
                page = {
                    "index": index,
                    "slide_id": page_id,
                    "image_url": image_url,
                    "html_preview": html_preview,
                    "status": "ready",
                    "split_index": split_index,
                    "split_count": split_count,
                }
                if width is not None:
                    page["width"] = width
                if height is not None:
                    page["height"] = height
                pages.append(page)
                if on_page_rendered is not None:
                    await on_page_rendered(
                        {
                            "slide_index": index,
                            "slide_id": page_id,
                            "preview_ready": True,
                            "page_count": len(pages),
                            "total_slides": len(structured_pages),
                            "image_url": image_url,
                            "width": width,
                            "height": height,
                            "html_preview_ready": bool(html_preview),
                            "html_preview": html_preview,
                            "status": "ready",
                            "split_index": split_index,
                            "split_count": split_count,
                        }
                    )
            continue
        except Exception as exc:
            logger.warning(
                "page_level_render_preview_failed task_id=%s slide=%s error=%s",
                task_id,
                page_id,
                exc,
            )

    if html_success_count > 0:
        format_name = (
            "png"
            if pages
            and all(
                isinstance(page.get("image_url"), str) and page.get("image_url")
                for page in pages
            )
            else "html"
        )
        return {
            "format": format_name,
            "pages": pages,
            "page_count": len(pages),
            "_resolved_markdown_content": _assemble_resolved_markdown(markdown_fragments),
        }
    return None
