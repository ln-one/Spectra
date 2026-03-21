"""Support helpers for courseware generation and fallback assembly."""

import inspect
from typing import Optional

from schemas.generation import CoursewareContent


def sorted_outline_nodes(outline_document: Optional[dict]) -> list[dict]:
    nodes = (
        (outline_document or {}).get("nodes")
        if isinstance(outline_document, dict)
        else None
    )
    if not isinstance(nodes, list):
        return []
    normalized = [node for node in nodes if isinstance(node, dict)]
    return sorted(normalized, key=lambda item: int(item.get("order") or 0))


def normalize_key_points(raw_points: object) -> list[str]:
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


async def retrieve_rag_context(
    ai_service,
    project_id: str,
    query: str,
    *,
    top_k: int = 5,
    score_threshold: float = 0.3,
    session_id: Optional[str] = None,
    filters: Optional[dict] = None,
):
    rag_loader = ai_service._retrieve_rag_context
    kwargs = {
        "top_k": top_k,
        "score_threshold": score_threshold,
        "session_id": session_id,
        "filters": filters,
    }
    try:
        supported = inspect.signature(rag_loader).parameters
        kwargs = {key: value for key, value in kwargs.items() if key in supported}
    except (TypeError, ValueError):
        pass
    return await rag_loader(project_id, query, **kwargs)


def build_outline_based_fallback_courseware(
    user_requirements: str,
    outline_document: Optional[dict],
) -> CoursewareContent:
    nodes = sorted_outline_nodes(outline_document)
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
        key_points = normalize_key_points(node.get("key_points"))
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
