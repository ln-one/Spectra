"""Render rewrite and style generation helpers for courseware generation."""

from __future__ import annotations

import logging
import os
from typing import Optional

from schemas.generation import CoursewareContent, PageClassItem, StyleManifest
from services.ai.model_router import ModelRouteTask
from services.courseware_ai.parsing import (
    parse_marp_slides,
    parse_render_rewrite_response,
    parse_style_generation_response,
)

logger = logging.getLogger(__name__)


def _resolve_render_rewrite_model() -> str:
    """Resolve render-rewrite model with DashScope MiniMax defaults."""
    model = os.getenv("COURSEWARE_RENDER_REWRITE_MODEL", "").strip()
    if not model:
        return "dashscope/MiniMax-M2.5"

    lowered = model.lower()
    minimax_aliases = {
        "minimax-m2.5": "MiniMax-M2.5",
        "minimax-m2.5-lightning": "MiniMax-M2.5-lightning",
        "minimax-m2.1": "MiniMax-M2.1",
        "minimax-m2.1-lightning": "MiniMax-M2.1-lightning",
        "minimax-m2": "MiniMax-M2",
    }
    if lowered.startswith("dashscope/"):
        _, suffix = model.split("/", 1)
        canonical = minimax_aliases.get(suffix.lower(), suffix)
        return f"dashscope/{canonical}"
    if lowered.startswith("minimax/"):
        _, suffix = model.split("/", 1)
        canonical = minimax_aliases.get(suffix.lower(), suffix)
        return f"dashscope/{canonical}"
    if lowered.startswith(
        ("minimax-", "minimax-m", "minimax_m", "minimax.")
    ) or model.startswith("MiniMax-"):
        canonical = minimax_aliases.get(lowered, model)
        return f"dashscope/{canonical}"
    return model


RENDER_REWRITE_MODEL = _resolve_render_rewrite_model()


async def generate_courseware_render_rewrite(
    ai_service,
    markdown_content: str,
    title: str,
    outline_document: Optional[dict] = None,
    rag_context: Optional[list[dict]] = None,
) -> Optional[str]:
    """LLM render rewrite stage for final Marp document."""
    from services.prompt_service import prompt_service

    slides = parse_marp_slides(markdown_content)
    slide_count = len(slides)

    outline_summary = None
    if outline_document and outline_document.get("sections"):
        sections = outline_document["sections"]
        outline_summary = "\n".join(
            f"- {s.get('title', '')}: {', '.join(s.get('key_points', []))}"
            for s in sections
        )

    image_references = []
    if rag_context:
        for chunk in rag_context[:10]:
            if chunk.get("metadata", {}).get("has_images"):
                images = chunk.get("metadata", {}).get("images", [])
                for img in images[:3]:
                    if img.get("url") and img.get("caption"):
                        image_references.append(
                            {
                                "url": img["url"],
                                "caption": img["caption"],
                            }
                        )

    prompt = prompt_service.build_courseware_render_rewrite_prompt(
        markdown_content=markdown_content,
        title=title,
        slide_count=slide_count,
        outline_summary=outline_summary,
        image_references=image_references if image_references else None,
    )

    response = await ai_service.generate(
        prompt=prompt,
        model=RENDER_REWRITE_MODEL or None,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
        has_rag_context=False,
        max_tokens=4000,
    )
    return parse_render_rewrite_response(response["content"])


async def generate_courseware_style(
    ai_service,
    markdown_content: str,
    outline_document: Optional[dict] = None,
) -> Optional[dict]:
    """Generate style contract for template-driven render fallback."""
    from services.prompt_service import prompt_service

    slides = parse_marp_slides(markdown_content)
    slide_count = len(slides)

    outline_summary = None
    if outline_document and outline_document.get("sections"):
        sections = outline_document["sections"]
        outline_summary = "\n".join(
            f"- {s.get('title', '')}: {', '.join(s.get('key_points', []))}"
            for s in sections
        )

    prompt = prompt_service.build_courseware_style_prompt(
        markdown_content=markdown_content,
        slide_count=slide_count,
        outline_summary=outline_summary,
    )

    response = await ai_service.generate(
        prompt=prompt,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
        has_rag_context=False,
        max_tokens=2000,
    )
    return parse_style_generation_response(response["content"])


def apply_generated_style(
    *,
    courseware: CoursewareContent,
    style_data: dict,
    project_id: str,
) -> None:
    style_manifest_data = style_data.get("style_manifest")
    if isinstance(style_manifest_data, dict):
        try:
            courseware.style_manifest = StyleManifest(**style_manifest_data)
        except Exception:
            logger.warning(
                "Style manifest parsing failed, keeping dict payload",
                extra={"project_id": project_id},
            )
            courseware.style_manifest = style_manifest_data
    else:
        courseware.style_manifest = style_manifest_data

    courseware.extra_css = style_data.get("extra_css")

    page_class_plan_data = style_data.get("page_class_plan")
    if isinstance(page_class_plan_data, list):
        normalized_plan = []
        for item in page_class_plan_data:
            if isinstance(item, dict):
                try:
                    normalized_plan.append(PageClassItem(**item))
                except Exception:
                    logger.warning(
                        "Page class item parsing failed, keeping dict payload",
                        extra={"project_id": project_id},
                    )
                    normalized_plan.append(item)
            else:
                normalized_plan.append(item)
        courseware.page_class_plan = normalized_plan
    else:
        courseware.page_class_plan = page_class_plan_data
