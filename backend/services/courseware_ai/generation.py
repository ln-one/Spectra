"""课件生成与修改工作流。"""

import logging
import os
import re
from typing import Optional

from schemas.generation import CoursewareContent
from schemas.outline import CoursewareOutline
from services.ai.model_router import ModelRouteTask
from services.courseware_ai.parsing import (
    extract_frontmatter,
    parse_marp_slides,
    reassemble_marp,
    strip_outer_code_fence,
)

logger = logging.getLogger(__name__)
ALLOW_COURSEWARE_FALLBACK = (
    os.getenv("ALLOW_COURSEWARE_FALLBACK", "false").lower() == "true"
)


def _sorted_outline_nodes(outline_document: Optional[dict]) -> list[dict]:
    nodes = (
        (outline_document or {}).get("nodes")
        if isinstance(outline_document, dict)
        else None
    )
    if not isinstance(nodes, list):
        return []
    normalized = [node for node in nodes if isinstance(node, dict)]
    return sorted(normalized, key=lambda item: int(item.get("order") or 0))


def _normalize_key_points(raw_points: object) -> list[str]:
    if not isinstance(raw_points, list):
        raw_points = []
    points = [str(point).strip() for point in raw_points if str(point).strip()]
    deduped: list[str] = []
    for point in points:
        if point not in deduped:
            deduped.append(point)
    if not any("互动" in point or "提问" in point for point in deduped):
        deduped.append("互动提问与即时反馈")
    if not any("板书" in point for point in deduped):
        deduped.append("板书逻辑主线归纳")
    while len(deduped) < 3:
        if len(deduped) == 0:
            deduped.append("核心概念梳理")
        elif len(deduped) == 1:
            deduped.append("关键例题分步讲解")
        else:
            deduped.append("易错点澄清与纠偏")
    return deduped[:6]


def _build_outline_based_fallback_courseware(
    user_requirements: str,
    outline_document: Optional[dict],
) -> CoursewareContent:
    nodes = _sorted_outline_nodes(outline_document)
    title = (
        str((outline_document or {}).get("title") or "").strip()
        if isinstance(outline_document, dict)
        else ""
    )
    if not title:
        title = (user_requirements or "课程主题")[:50]

    markdown_slides: list[str] = []
    lesson_plan_lines: list[str] = [
        "# 教学目标",
        "- 围绕已确认大纲完成完整课堂讲解",
        "- 用关键例题与易错点实现知识闭环",
        "",
        "# 教学过程",
    ]

    for index, node in enumerate(nodes, start=1):
        raw_title = str(node.get("title") or "").strip()
        slide_title = raw_title or f"第{index}页"
        key_points = _normalize_key_points(node.get("key_points"))
        markdown_slides.append(
            "\n".join([f"# {slide_title}", "", *[f"- {point}" for point in key_points]])
        )
        lesson_plan_lines.extend(
            [
                f"## {index:02d}. {slide_title}",
                f"- 教学目标：完成“{slide_title}”核心理解与表达。",
                f"- 互动提问：围绕“{key_points[0]}”设计追问并收集反馈。",
                f"- 板书逻辑：以“{key_points[1]}”组织板书主线。",
                f"- 易错提醒：结合“{key_points[2]}”进行反例澄清。",
            ]
        )

    if not markdown_slides:
        return CoursewareContent(
            title=title,
            markdown_content=f"# {title}\n\n- 核心内容待补充",
            lesson_plan_markdown="# 教学目标\n- 补充课程内容后再生成正式教案",
        )

    return CoursewareContent(
        title=title,
        markdown_content="\n\n---\n\n".join(markdown_slides),
        lesson_plan_markdown="\n".join(lesson_plan_lines),
    )


async def modify_courseware(
    ai_service,
    current_content: str,
    instruction: str,
    target_slides: Optional[list[int]] = None,
) -> CoursewareContent:
    """按整份或指定页修改课件内容。"""
    from services.prompt_service import prompt_service

    frontmatter = extract_frontmatter(current_content)
    all_slides = parse_marp_slides(current_content)

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
        )
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
            max_tokens=3000,
        )
        modified_raw = strip_outer_code_fence(response["content"])
        modified_parts = re.split(r"\n---\s*\n", modified_raw)

        if len(modified_parts) != len(target_indices):
            logger.warning(
                (
                    "modify_courseware: LLM returned %d sections for %d targets, "
                    "falling back to full-document regeneration."
                ),
                len(modified_parts),
                len(target_indices),
            )
            prompt = prompt_service.build_modify_prompt(
                current_content=current_content,
                instruction=instruction,
            )
            response = await ai_service.generate(
                prompt=prompt,
                route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
                max_tokens=4000,
            )
            new_markdown = strip_outer_code_fence(response["content"])
        else:
            slide_contents = [slide["content"] for slide in all_slides]
            for target_index, new_part in zip(target_indices, modified_parts):
                slide_contents[target_index] = new_part.strip()
            new_markdown = reassemble_marp(frontmatter, slide_contents)
    else:
        prompt = prompt_service.build_modify_prompt(
            current_content=current_content,
            instruction=instruction,
        )
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.PREVIEW_MODIFICATION.value,
            max_tokens=4000,
        )
        new_markdown = strip_outer_code_fence(response["content"])

    return ai_service._parse_courseware_response(new_markdown, instruction[:50])


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

        outline_nodes = (outline_document or {}).get("nodes") or []
        if outline_document:
            user_requirements = ai_service._merge_requirements_with_outline(
                user_requirements=user_requirements,
                outline_document=outline_document,
            )

        rag_context = await ai_service._retrieve_rag_context(
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
            logger.warning(
                "Using outline-based fallback courseware due to generation failure",
                extra={
                    "project_id": project_id,
                    "outline_node_count": len(outline_nodes),
                },
            )
            return _build_outline_based_fallback_courseware(
                user_requirements=user_requirements,
                outline_document=outline_document,
            )
        if ALLOW_COURSEWARE_FALLBACK:
            return ai_service._get_fallback_courseware(user_requirements)
        raise


def merge_requirements_with_outline(
    user_requirements: str, outline_document: dict
) -> str:
    """把确认后的大纲约束拼接回原始需求。"""
    nodes = (outline_document or {}).get("nodes") or []
    if not nodes:
        return user_requirements

    sorted_nodes = sorted(nodes, key=lambda item: item.get("order", 0))
    outline_lines = []
    for node in sorted_nodes:
        title = node.get("title", "Untitled Slide")
        points = node.get("key_points") or []
        key_points = " | ".join(str(point) for point in points if point) or "N/A"
        outline_lines.append(
            f"- Slide {node.get('order', '?')}: {title} (key points: {key_points})"
        )

    outline_block = "\n".join(outline_lines)
    return (
        f"{user_requirements}\n\n"
        "Confirmed outline (must follow strictly):\n"
        f"- Exact slide count required: {len(sorted_nodes)}\n"
        "- Do not add extra intro/summary slides unless they exist in outline.\n"
        "- Keep the same slide order and titles as outline.\n"
        f"{outline_block}"
    )
