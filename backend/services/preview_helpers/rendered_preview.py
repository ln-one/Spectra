from __future__ import annotations

import base64
import logging
import struct
from pathlib import Path
from typing import Optional

from services.generation import generation_service
from services.template import TemplateConfig

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


def _normalize_template_config(template_config: Optional[dict]) -> TemplateConfig:
    if template_config:
        return TemplateConfig(**template_config)
    return TemplateConfig()


async def build_rendered_preview_payload(
    *,
    task_id: str,
    title: str,
    markdown_content: str,
    template_config: Optional[dict] = None,
    slide_ids: Optional[list[str]] = None,
    style_manifest: Optional[dict] = None,
    extra_css: Optional[str] = None,
    page_class_plan: Optional[list[dict]] = None,
) -> Optional[dict]:
    if not str(markdown_content or "").strip():
        return None

    try:
        image_paths = await generation_service.generate_slide_images(
            type(
                "PreviewCoursewareContent",
                (),
                {
                    "title": title or "课件预览",
                    "markdown_content": markdown_content,
                    "lesson_plan_markdown": "",
                    "style_manifest": (
                        type("StyleManifest", (), style_manifest)()
                        if style_manifest
                        else None
                    ),
                    "extra_css": extra_css,
                    "page_class_plan": (
                        [type("PageClassItem", (), item)() for item in page_class_plan]
                        if page_class_plan
                        else None
                    ),
                },
            )(),
            task_id,
            _normalize_template_config(template_config),
        )
    except Exception as exc:
        logger.warning(
            "rendered_preview_generation_failed task_id=%s error=%s", task_id, exc
        )
        return None

    pages: list[dict] = []
    for index, image_path_str in enumerate(image_paths):
        image_path = Path(image_path_str)
        width, height = _read_png_dimensions(image_path)
        pages.append(
            {
                "index": index,
                "slide_id": (
                    slide_ids[index]
                    if slide_ids and index < len(slide_ids) and slide_ids[index]
                    else f"{task_id}-slide-{index}"
                ),
                "image_url": _to_data_url(image_path),
                "width": width,
                "height": height,
            }
        )

    return {
        "format": "png",
        "pages": pages,
        "page_count": len(pages),
    }
