"""课件生成与修改工作流。"""

import logging
import os
import re
from typing import Optional

from schemas.generation import CoursewareContent
from schemas.outline import CoursewareOutline
from services.ai.model_router import ModelRouteTask
from services.courseware_ai.generation_support import (
    build_outline_based_fallback_courseware,
    build_rag_grounded_fallback_courseware,
    merge_requirements_with_outline,
    retrieve_rag_context,
    sorted_outline_nodes,
)
from services.courseware_ai.parsing import (
    extract_frontmatter,
    parse_marp_slides,
    parse_style_generation_response,
    reassemble_marp,
    sanitize_ppt_markdown,
    strip_outer_code_fence,
)

logger = logging.getLogger(__name__)
ALLOW_COURSEWARE_FALLBACK = (
    os.getenv("ALLOW_COURSEWARE_FALLBACK", "false").lower() == "true"
)
_PLACEHOLDER_MARKER = "Courseware is being prepared..."


async def _generate_courseware_render_rewrite(
    ai_service,
    markdown_content: str,
    title: str,
    outline_document: Optional[dict] = None,
    rag_context: Optional[list[dict]] = None,
) -> Optional[str]:
    """Render rewrite 阶段：LLM 整套重写最终 Marp 文档"""
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

    # 从 RAG 上下文提取图片引用
    image_references = []
    if rag_context:
        for chunk in rag_context[:10]:  # 限制前 10 个
            if chunk.get("metadata", {}).get("has_images"):
                images = chunk.get("metadata", {}).get("images", [])
                for img in images[:3]:  # 每个 chunk 最多 3 张
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
        route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
        has_rag_context=False,
        max_tokens=4000,
    )

    from services.courseware_ai.parsing import parse_render_rewrite_response

    return parse_render_rewrite_response(response["content"])


async def _generate_courseware_style(
    ai_service,
    markdown_content: str,
    outline_document: Optional[dict] = None,
) -> Optional[dict]:
    """样式生成阶段：基于最终正文生成样式契约（fallback 用）"""
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


def _ensure_slide_modify_result_is_safe(
    *,
    original_content: str,
    modified_content: CoursewareContent,
    target_slides: Optional[list[int]],
) -> None:
    if not target_slides:
        return

    original_slides = parse_marp_slides(original_content)
    modified_slides = parse_marp_slides(modified_content.markdown_content)

    if (
        _PLACEHOLDER_MARKER in str(modified_content.markdown_content or "")
        or not modified_slides
    ):
        raise ValueError("slide modify returned placeholder preview content")

    if original_slides and len(modified_slides) < len(original_slides):
        raise ValueError("slide modify returned fewer slides than the current deck")


def _split_modified_parts(modified_raw: str) -> list[str]:
    slides = parse_marp_slides(modified_raw)
    if slides:
        return [
            str(slide.get("content") or "").strip()
            for slide in slides
            if str(slide.get("content") or "").strip()
        ]
    return [
        part.strip() for part in re.split(r"\n---\s*\n", modified_raw) if part.strip()
    ]


def _coerce_partial_modify_parts(
    *,
    modified_raw: str,
    all_slides: list[dict],
    target_indices: list[int],
) -> list[str]:
    parts = _split_modified_parts(modified_raw)
    if len(parts) == len(target_indices):
        return parts

    parsed_slides = parse_marp_slides(modified_raw)
    if parsed_slides and len(parsed_slides) == len(all_slides):
        extracted = [
            parsed_slides[index]["content"]
            for index in target_indices
            if 0 <= index < len(parsed_slides)
        ]
        if len(extracted) == len(target_indices):
            logger.warning(
                (
                    "modify_courseware: LLM returned the full deck (%d slides) "
                    "for %d targets; extracting target slide content."
                ),
                len(parsed_slides),
                len(target_indices),
            )
            return extracted

    return parts


async def modify_courseware(
    ai_service,
    current_content: str,
    instruction: str,
    target_slides: Optional[list[int]] = None,
    rag_context: Optional[list[dict]] = None,
    strict_source_mode: bool = False,
) -> CoursewareContent:
    """按整份或指定页修改课件内容。"""
    from services.prompt_service import prompt_service

    frontmatter = extract_frontmatter(current_content)
    all_slides = parse_marp_slides(current_content)

    if strict_source_mode and not rag_context:
        raise ValueError(
            "source constrained slide modify requires non-empty rag_context"
        )

    if target_slides and all_slides:
        target_indices = [
            index - 1 for index in target_slides if 1 <= index <= len(all_slides)
        ]
        if not target_indices:
            target_indices = list(range(len(all_slides)))

        target_content = "\n\n---\n\n".join(
            all_slides[index]["content"] for index in target_indices
        )
        target_labels = [str(index + 1) for index in target_indices]
        prompt = prompt_service.build_modify_prompt(
            current_content=target_content,
            instruction=instruction,
            target_slides=target_labels,
            rag_context=rag_context,
            strict_source_mode=strict_source_mode,
        )

        async def _run_partial_modify(modify_instruction: str) -> list[str]:
            prompt = prompt_service.build_modify_prompt(
                current_content=target_content,
                instruction=modify_instruction,
                target_slides=target_labels,
                rag_context=rag_context,
                strict_source_mode=strict_source_mode,
            )
            response = await ai_service.generate(
                prompt=prompt,
                route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
                has_rag_context=bool(rag_context),
                max_tokens=3000,
            )
            modified_raw = strip_outer_code_fence(response["content"])
            return _coerce_partial_modify_parts(
                modified_raw=modified_raw,
                all_slides=all_slides,
                target_indices=target_indices,
            )

        modified_parts = await _run_partial_modify(instruction)

        if len(modified_parts) != len(target_indices):
            logger.warning(
                (
                    "modify_courseware: LLM returned %d sections for %d targets, "
                    "retrying with stricter single-slide contract."
                ),
                len(modified_parts),
                len(target_indices),
            )
            retry_instruction = (
                f"{instruction}\n\n"
                "重要：只返回目标页，不要返回整份课件，不要新增页，不要减少页。"
            )
            modified_parts = await _run_partial_modify(retry_instruction)

        if len(modified_parts) != len(target_indices):
            raise ValueError(
                (
                    "slide modify returned "
                    f"{len(modified_parts)} sections for {len(target_indices)} targets"
                )
            )

        slide_contents = [slide["content"] for slide in all_slides]
        for target_index, new_part in zip(target_indices, modified_parts):
            slide_contents[target_index] = new_part.strip()
        new_markdown = reassemble_marp(frontmatter, slide_contents)
        sanitized_markdown = sanitize_ppt_markdown(new_markdown)
        parsed_slides = parse_marp_slides(sanitized_markdown)
        title = (
            str(parsed_slides[0].get("title") or "").strip()
            if parsed_slides
            else instruction[:50]
        )
        parsed = CoursewareContent(
            title=title or instruction[:50],
            markdown_content=sanitized_markdown,
            lesson_plan_markdown="",
        )
    else:
        prompt = prompt_service.build_modify_prompt(
            current_content=current_content,
            instruction=instruction,
            rag_context=rag_context,
            strict_source_mode=strict_source_mode,
        )
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
            has_rag_context=bool(rag_context),
            max_tokens=4000,
        )
        new_markdown = strip_outer_code_fence(response["content"])
        parsed = ai_service._parse_courseware_response(new_markdown, instruction[:50])
    _ensure_slide_modify_result_is_safe(
        original_content=current_content,
        modified_content=parsed,
        target_slides=target_slides,
    )
    return parsed


async def extract_structured_content(
    ai_service,
    project_id: str,
    user_requirements: str,
    template_style: str = "default",
    outline: Optional[CoursewareOutline] = None,
    session_id: Optional[str] = None,
    rag_source_ids: Optional[list[str]] = None,
) -> CoursewareContent:
    """结合确认后的大纲与 RAG 上下文生成课件。"""
    from services.prompt_service import prompt_service

    if not outline:
        outline = await ai_service.generate_outline(
            project_id,
            user_requirements,
            template_style,
            session_id=session_id,
            rag_source_ids=rag_source_ids,
        )

    rag_context = await ai_service._retrieve_rag_context(
        project_id,
        user_requirements,
        top_k=8,
        session_id=session_id,
        filters={"file_ids": rag_source_ids} if rag_source_ids else None,
    )

    outline_guide = "\n".join(
        (
            f"- {section.title} ({section.slide_count} slides): "
            f"{', '.join(section.key_points)}"
        )
        for section in outline.sections
    )
    enhanced_requirements = (
        f"{user_requirements}\n\n"
        f"Please strictly follow this outline structure:\n{outline_guide}"
    )

    prompt = prompt_service.build_courseware_prompt(
        user_requirements=enhanced_requirements,
        template_style=template_style,
        rag_context=rag_context,
    )

    response = await ai_service.generate(
        prompt=prompt,
        route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
        has_rag_context=bool(rag_context),
        max_tokens=4000,
    )
    return ai_service._parse_courseware_response(response["content"], outline.title)


async def generate_courseware_content(
    ai_service,
    project_id: str,
    user_requirements: Optional[str] = None,
    template_style: str = "default",
    outline_document: Optional[dict] = None,
    outline_version: Optional[int] = None,
    session_id: Optional[str] = None,
    rag_source_ids: Optional[list[str]] = None,
) -> CoursewareContent:
    """生成课件 Markdown 与教案 Markdown。"""
    from services.prompt_service import prompt_service

    outline_nodes: list[dict] = []
    rag_context: Optional[list[dict]] = None

    try:
        if not user_requirements:
            user_requirements = "通用教学课件"

        logger.info(
            "Generating courseware content for project %s",
            project_id,
            extra={
                "project_id": project_id,
                "requirements": user_requirements[:100],
                "template_style": template_style,
                "outline_version": outline_version,
            },
        )

        outline_nodes = sorted_outline_nodes(outline_document)
        if outline_document:
            user_requirements = merge_requirements_with_outline(
                user_requirements=user_requirements,
                outline_document=outline_document,
            )

        rag_context = await retrieve_rag_context(
            ai_service,
            project_id,
            user_requirements,
            session_id=session_id,
            filters={"file_ids": rag_source_ids} if rag_source_ids else None,
        )
        if rag_context:
            logger.info(
                "RAG retrieved %d chunks",
                len(rag_context),
                extra={"project_id": project_id},
            )

        prompt = prompt_service.build_courseware_prompt(
            user_requirements=user_requirements,
            template_style=template_style,
            rag_context=rag_context,
            outline_mode=bool(outline_nodes),
            outline_slide_count=len(outline_nodes) if outline_nodes else None,
        )

        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
            has_rag_context=bool(rag_context),
            max_tokens=4000,
        )
        courseware = ai_service._parse_courseware_response(
            response["content"],
            user_requirements,
        )
        if outline_nodes:
            courseware.markdown_content = ai_service._enforce_outline_structure(
                courseware.markdown_content,
                outline_document=outline_document or {},
            )

        # Render rewrite 阶段（主路径）
        try:
            render_markdown = await _generate_courseware_render_rewrite(
                ai_service,
                courseware.markdown_content,
                courseware.title,
                outline_document,
                rag_context,
            )
            if render_markdown:
                courseware.render_markdown = render_markdown
                logger.info(
                    "Render rewrite succeeded",
                    extra={"project_id": project_id},
                )
        except Exception as rewrite_exc:
            logger.warning(
                f"Render rewrite failed, will use template fallback: {rewrite_exc}",
                extra={"project_id": project_id},
            )
            # 回退到样式生成
            try:
                style_data = await _generate_courseware_style(
                    ai_service,
                    courseware.markdown_content,
                    outline_document,
                )
                if style_data:
                    courseware.style_manifest = style_data.get("style_manifest")
                    courseware.extra_css = style_data.get("extra_css")
                    courseware.page_class_plan = style_data.get("page_class_plan")
            except Exception as style_exc:
                logger.warning(
                    f"Style generation also failed: {style_exc}",
                    extra={"project_id": project_id},
                )

        logger.info(
            "Courseware content generated successfully",
            extra={"project_id": project_id, "title": courseware.title},
        )
        return courseware

    except Exception as exc:
        logger.error(
            "Failed to generate courseware: %s",
            exc,
            extra={"project_id": project_id},
            exc_info=True,
        )
        if outline_nodes:
            rag_grounded_fallback = build_rag_grounded_fallback_courseware(
                user_requirements=user_requirements,
                rag_context=rag_context,
                outline_document=outline_document,
            )
            if rag_grounded_fallback is not None:
                logger.warning(
                    "Using RAG-grounded fallback courseware due to generation failure",
                    extra={
                        "project_id": project_id,
                        "outline_node_count": len(outline_nodes),
                        "rag_chunk_count": len(rag_context or []),
                    },
                )
                return rag_grounded_fallback
            logger.warning(
                "Using outline-based fallback courseware due to generation failure",
                extra={
                    "project_id": project_id,
                    "outline_node_count": len(outline_nodes),
                },
            )
            return build_outline_based_fallback_courseware(
                user_requirements=user_requirements,
                outline_document=outline_document,
            )
        if ALLOW_COURSEWARE_FALLBACK:
            return ai_service._get_fallback_courseware(user_requirements)
        raise
