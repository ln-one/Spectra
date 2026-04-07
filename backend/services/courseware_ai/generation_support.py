"""Support helpers for courseware generation and fallback assembly."""

import inspect
import re
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
    while len(deduped) < 3:
        if len(deduped) == 0:
            deduped.append("核心概念梳理")
        elif len(deduped) == 1:
            deduped.append("关键例题讲解与迁移")
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
                f"- 讲解主线：围绕“{key_points[1]}”组织讲解步骤。",
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


def _sanitize_rag_text(text: str, *, limit: int = 220) -> str:
    compact = " ".join(str(text or "").split())
    compact = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", compact)
    compact = re.sub(
        r"[\w\u4e00-\u9fff().-]+\.(pdf|pptx|ppt|docx|doc|jpg|jpeg|png)[:：]?",
        " ",
        compact,
        flags=re.IGNORECASE,
    )
    compact = re.sub(r"\b[a-f0-9]{16,}\.(jpg|jpeg|png|pdf)\b", " ", compact, flags=re.I)
    compact = re.sub(r"\s+#\s*", " ", compact)
    compact = re.sub(r"\s{2,}", " ", compact).strip(" -:：,，;；)")
    if not compact:
        return ""
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "..."


def _fallback_outline_bullets(
    slide_title: str,
    node: Optional[dict],
    *,
    max_items: int = 3,
) -> list[str]:
    node = node if isinstance(node, dict) else {}
    key_points = normalize_key_points(node.get("key_points"))
    bullets: list[str] = []
    for point in key_points[:max_items]:
        bullets.append(f"结合已检索资料，围绕“{point}”说明“{slide_title}”的核心内容。")
    return bullets or [f"结合已检索资料梳理“{slide_title}”的关键概念与教学重点。"]


def _collect_rag_bullets(
    rag_context: Optional[list[dict]],
    *,
    max_items: int = 8,
) -> list[str]:
    bullets: list[str] = []
    seen: set[str] = set()
    if not isinstance(rag_context, list):
        return bullets

    for item in rag_context:
        if not isinstance(item, dict):
            continue
        content = _sanitize_rag_text(str(item.get("content") or ""))
        if not content:
            continue
        bullet = content
        if bullet in seen:
            continue
        seen.add(bullet)
        bullets.append(bullet)
        if len(bullets) >= max_items:
            break
    return bullets


def build_rag_grounded_fallback_courseware(
    *,
    user_requirements: str,
    rag_context: Optional[list[dict]],
    outline_document: Optional[dict] = None,
) -> Optional[CoursewareContent]:
    bullets = _collect_rag_bullets(rag_context)
    if not bullets:
        return None

    nodes = sorted_outline_nodes(outline_document)
    title = (
        str((outline_document or {}).get("title") or "").strip()
        if isinstance(outline_document, dict)
        else ""
    )
    if not title:
        title = (user_requirements or "课程主题")[:50]

    slide_titles: list[str] = []
    slide_nodes: list[dict] = []
    if nodes:
        slide_titles = [str(node.get("title") or "").strip() for node in nodes]
        slide_nodes = [node for node in nodes if str(node.get("title") or "").strip()]
        slide_titles = [item for item in slide_titles if item]
    if not slide_titles:
        slide_titles = ["课程任务与目标", "关键依据与知识点", "互动提问与课堂推进"]
        slide_nodes = [{} for _ in slide_titles]

    chunk_size = max(1, (len(bullets) + len(slide_titles) - 1) // len(slide_titles))
    markdown_slides: list[str] = []
    lesson_plan_lines: list[str] = [
        "# 教学目标",
        "- 优先围绕已检索资料中的有效事实组织讲解。",
        "- 讲解内容保持与大纲和检索依据一致，不额外扩写无根据结论。",
        "",
        "# 教学过程",
    ]

    for index, slide_title in enumerate(slide_titles, start=1):
        start = (index - 1) * chunk_size
        end = min(start + chunk_size, len(bullets))
        segment = bullets[start:end]
        node = slide_nodes[index - 1] if index - 1 < len(slide_nodes) else {}
        if len(segment) < 2:
            for fallback_point in _fallback_outline_bullets(slide_title, node):
                if fallback_point not in segment:
                    segment.append(fallback_point)
                if len(segment) >= 3:
                    break
        if not segment:
            segment = _fallback_outline_bullets(slide_title, node)
        markdown_slides.append(
            "\n".join(
                [
                    f"# {slide_title}",
                    "",
                    *[f"- {point}" for point in segment],
                ]
            )
        )
        lesson_plan_lines.extend(
            [
                f"## {index:02d}. {slide_title}",
                "- 讲解要求：优先引用已检索资料中的明确依据。",
                "- 互动提问：基于本页信息设计一个理解性问题。",
                "- 易错提醒：记录一个可能误解点及其纠偏方式。",
            ]
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
