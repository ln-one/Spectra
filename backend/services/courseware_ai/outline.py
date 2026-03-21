"""课件大纲生成相关逻辑。"""

import json
import logging
import re

from schemas.outline import CoursewareOutline, OutlineSection
from services.ai.model_router import ModelRouteTask

logger = logging.getLogger(__name__)

_SCAFFOLD_SECTIONS = [
    ("导入与目标", ["主题引入", "学习目标", "先验知识唤醒", "课堂提问起点"], 2),
    ("核心概念", ["关键概念", "原理讲解", "知识结构梳理", "板书主线"], 3),
    ("案例与应用", ["典型案例", "应用场景", "易错点辨析", "变式题训练"], 3),
    ("练习与总结", ["课堂练习", "结果反馈", "总结迁移", "提问回扣"], 2),
]
_FOCUS_ANCHORS = ("知识地图", "关键例题", "易错点澄清", "互动提问", "板书逻辑")
_GENERIC_TITLE_PATTERNS = (
    "核心知识点",
    "知识点",
    "内容讲解",
    "课程内容",
    "章节",
)


def _normalize_title(title: str) -> str:
    return re.sub(r"\s+", "", str(title or "")).lower()


def _extract_target_pages(user_requirements: str) -> int | None:
    text = str(user_requirements or "")
    patterns = (
        r"目标页数\s*[：:]\s*(\d{1,3})",
        r"(?:共|总|约|大约|预计)?\s*(\d{1,3})\s*(?:页|slides?|pages?)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        pages = int(match.group(1))
        if pages <= 0:
            continue
        return min(max(pages, 6), 40)
    return None


def _contains_anchor(text: str, anchor: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    return anchor in normalized


def _is_generic_title(title: str) -> bool:
    normalized = _normalize_title(title)
    compact = re.sub(r"\d+", "", normalized)
    return any(pattern in compact for pattern in _GENERIC_TITLE_PATTERNS)


def _is_placeholder_point(point: str) -> bool:
    text = str(point or "").strip()
    if not text:
        return True
    normalized = re.sub(r"\s+", "", text)
    patterns = (
        r"^(要点|知识点|重点|难点|内容|核心知识点)[A-Za-z0-9一二三四五六七八九十]*$",
        r"^关键内容$",
        r"^课堂内容$",
    )
    return any(re.match(pattern, normalized) for pattern in patterns)


def _looks_low_quality_outline(outline: CoursewareOutline) -> bool:
    sections = list(outline.sections or [])
    if not sections:
        return True

    generic_title_count = sum(_is_generic_title(section.title) for section in sections)
    generic_title_ratio = generic_title_count / max(len(sections), 1)
    if generic_title_ratio >= 0.5:
        return True

    key_points = [
        point
        for section in sections
        for point in (section.key_points or [])
        if str(point).strip()
    ]
    if not key_points:
        return True
    placeholder_ratio = sum(_is_placeholder_point(point) for point in key_points) / max(
        len(key_points), 1
    )
    if placeholder_ratio >= 0.5:
        return True
    return False


def _build_deterministic_outline(
    user_requirements: str,
    target_pages: int | None,
) -> CoursewareOutline:
    pages = target_pages or 12
    sections = [
        OutlineSection(
            title="导入与目标",
            key_points=["学习目标", "情境导入", "课堂互动提问", "板书逻辑预告"],
            slide_count=2,
        ),
        OutlineSection(
            title="知识地图构建",
            key_points=["知识地图", "概念关系梳理", "核心原理拆解", "板书主线搭建"],
            slide_count=2,
        ),
        OutlineSection(
            title="关键例题精讲",
            key_points=["关键例题", "解题步骤可视化", "变式题训练", "课堂追问"],
            slide_count=3,
        ),
        OutlineSection(
            title="易错点澄清",
            key_points=["易错点澄清", "反例辨析", "纠错策略", "板书归纳"],
            slide_count=2,
        ),
        OutlineSection(
            title="互动练习与总结",
            key_points=["分层练习", "互动问答", "课堂小结", "作业延伸"],
            slide_count=2,
        ),
    ]
    outline = CoursewareOutline(
        title=user_requirements[:50] or "课堂教学大纲",
        sections=sections,
        total_slides=sum(section.slide_count for section in sections),
        summary="已按课堂可执行结构生成知识地图+例题+易错点闭环大纲",
    )
    return _align_slide_count_with_target(outline, pages)


def _inject_focus_anchors(outline: CoursewareOutline) -> CoursewareOutline:
    sections = list(outline.sections or [])
    if not sections:
        return outline

    enriched_sections: list[OutlineSection] = []
    for idx, section in enumerate(sections):
        key_points = [
            str(point).strip()
            for point in (section.key_points or [])
            if str(point).strip()
        ]
        if not any("互动" in point or "提问" in point for point in key_points):
            key_points.append("互动提问设计")
        if not any("板书" in point for point in key_points):
            key_points.append("板书逻辑梳理")
        anchor = _FOCUS_ANCHORS[idx % len(_FOCUS_ANCHORS)]
        if not any(_contains_anchor(point, anchor) for point in key_points):
            key_points.append(anchor)

        deduped_points: list[str] = []
        for point in key_points:
            if point not in deduped_points:
                deduped_points.append(point)
        enriched_sections.append(
            OutlineSection(
                title=section.title,
                key_points=deduped_points[:6],
                slide_count=max(int(section.slide_count or 0), 2),
            )
        )

    return CoursewareOutline(
        title=outline.title,
        sections=enriched_sections,
        total_slides=sum(item.slide_count for item in enriched_sections),
        summary=outline.summary,
    )


def _align_slide_count_with_target(
    outline: CoursewareOutline, target_pages: int | None
) -> CoursewareOutline:
    if not target_pages:
        return outline
    sections = list(outline.sections or [])
    if not sections:
        return outline

    base_total = sum(max(int(item.slide_count or 1), 1) for item in sections)
    if base_total == target_pages:
        return outline

    adjusted = [max(int(item.slide_count or 1), 1) for item in sections]
    if base_total < target_pages:
        cursor = 0
        while sum(adjusted) < target_pages:
            adjusted[cursor % len(adjusted)] += 1
            cursor += 1
    else:
        cursor = 0
        while sum(adjusted) > target_pages and any(count > 1 for count in adjusted):
            idx = cursor % len(adjusted)
            if adjusted[idx] > 1:
                adjusted[idx] -= 1
            cursor += 1
            if cursor > len(adjusted) * max(target_pages, 1) * 2:
                break

    normalized_sections = [
        OutlineSection(
            title=section.title,
            key_points=list(section.key_points or []),
            slide_count=adjusted[idx],
        )
        for idx, section in enumerate(sections)
    ]
    return CoursewareOutline(
        title=outline.title,
        sections=normalized_sections,
        total_slides=sum(adjusted),
        summary=outline.summary,
    )


def _is_outline_too_sparse(outline: CoursewareOutline) -> bool:
    sections = list(outline.sections or [])
    if len(sections) < 3:
        return True
    total_key_points = sum(len(section.key_points or []) for section in sections)
    if total_key_points < max(9, len(sections) * 3):
        return True
    distinct_titles = {_normalize_title(section.title) for section in sections}
    if len(distinct_titles) < min(3, len(sections)):
        return True
    if any(len(section.key_points or []) < 3 for section in sections):
        return True
    return False


def _enrich_sparse_outline(outline: CoursewareOutline) -> CoursewareOutline:
    sections = list(outline.sections or [])
    enriched: list[OutlineSection] = []
    used_titles = set()

    for section in sections:
        title = str(section.title or "").strip() or "章节"
        normalized_title = _normalize_title(title)
        if normalized_title in used_titles:
            continue
        used_titles.add(normalized_title)
        key_points = [
            str(point).strip()
            for point in (section.key_points or [])
            if str(point).strip()
        ]
        if len(key_points) < 3:
            scaffold_points = next(
                (
                    points
                    for scaffold_title, points, _count in _SCAFFOLD_SECTIONS
                    if any(
                        token in normalized_title
                        for token in (_normalize_title(scaffold_title),)
                    )
                ),
                [],
            )
            for point in scaffold_points:
                if point not in key_points:
                    key_points.append(point)
                if len(key_points) >= 3:
                    break
        enriched.append(
            OutlineSection(
                title=title,
                key_points=key_points or ["核心内容", "课堂活动"],
                slide_count=max(int(section.slide_count or 0), 2),
            )
        )

    existing_titles = {_normalize_title(section.title) for section in enriched}
    for title, key_points, slide_count in _SCAFFOLD_SECTIONS:
        normalized_title = _normalize_title(title)
        if normalized_title in existing_titles:
            continue
        enriched.append(
            OutlineSection(
                title=title,
                key_points=list(key_points),
                slide_count=slide_count,
            )
        )
        existing_titles.add(normalized_title)

    total_slides = sum(section.slide_count for section in enriched)
    return CoursewareOutline(
        title=outline.title,
        sections=enriched,
        total_slides=total_slides,
        summary=outline.summary or "教学结构已补齐为完整课堂流程",
    )


async def generate_outline(
    ai_service,
    project_id: str,
    user_requirements: str,
    template_style: str = "default",
    session_id: str | None = None,
    rag_source_ids: list[str] | None = None,
) -> CoursewareOutline:
    """根据需求生成结构化课件大纲。"""
    from services.prompt_service import STYLE_REQUIREMENTS, _format_rag_context

    rag_context = await ai_service._retrieve_rag_context(
        project_id,
        user_requirements,
        session_id=session_id,
        filters={"file_ids": rag_source_ids} if rag_source_ids else None,
    )

    rag_hint = ""
    if rag_context:
        rag_hint = (
            "\n\n以下是从用户上传资料中检索到的参考内容，"
            "请据此优化大纲：\n" + _format_rag_context(rag_context)
        )

    style_desc = STYLE_REQUIREMENTS.get(template_style, STYLE_REQUIREMENTS["default"])
    target_pages = _extract_target_pages(user_requirements)
    target_pages_constraint = (
        f"本次目标总页数：{target_pages} 页。章节 slide_count 总和应尽量等于该值。"
        if target_pages
        else "总页数通常控制在 10-20 页。"
    )

    prompt = f"""你是资深学科教学设计师。
请基于以下需求生成结构化课件大纲。
{rag_hint}
参考内容请结合用户资料合理吸收。
教学需求：{user_requirements}
模板风格：{template_style} - {style_desc}

仅返回 JSON：
{{
  "title": "课件标题",
  "sections": [
    {{"title": "章节标题", "key_points": ["要点A", "要点B"], "slide_count": 2}}
  ],
  "summary": "一句话总结"
}}

约束：
1. 章节数 3-8，完整覆盖教学流程（导入 -> 讲授 -> 案例/练习 -> 总结）。
2. 每章 3-6 个关键要点，且每章必须同时包含“互动提问”和“板书逻辑”相关要点。
3. 整体必须覆盖“知识地图”“关键例题”“易错点澄清”三类教学要素（至少各出现一次）。
4. {target_pages_constraint}
"""
    try:
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
            has_rag_context=bool(rag_context),
            max_tokens=1500,
        )
        content = response["content"].strip()

        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            raise ValueError("No JSON found in response")

        parsed = json.loads(json_match.group())
        sections = [OutlineSection(**section) for section in parsed.get("sections", [])]
        if not sections:
            raise ValueError("LLM returned empty sections list")
        total_slides = sum(section.slide_count for section in sections)

        outline = CoursewareOutline(
            title=parsed.get("title", user_requirements[:50]),
            sections=sections,
            total_slides=total_slides,
            summary=parsed.get("summary"),
        )
        if _is_outline_too_sparse(outline):
            logger.warning("Outline generation returned sparse structure, enriching")
            outline = _enrich_sparse_outline(outline)
        if _looks_low_quality_outline(outline):
            logger.warning(
                "Outline generation returned low-quality placeholders, rebuilding"
            )
            outline = _build_deterministic_outline(user_requirements, target_pages)
        outline = _inject_focus_anchors(outline)
        outline = _align_slide_count_with_target(outline, target_pages)
        return outline
    except Exception as exc:
        logger.warning("Outline generation failed: %s, using fallback", exc)
        fallback = get_fallback_outline(user_requirements)
        fallback = _inject_focus_anchors(fallback)
        fallback = _align_slide_count_with_target(fallback, target_pages)
        return fallback


def get_fallback_outline(user_requirements: str) -> CoursewareOutline:
    """大纲生成失败时的兜底结果。"""
    target_pages = _extract_target_pages(user_requirements)
    normalized_requirements = str(user_requirements or "").strip() or "课堂教学大纲"
    fallback = _build_deterministic_outline(
        user_requirements=normalized_requirements,
        target_pages=target_pages,
    )
    fallback = _inject_focus_anchors(fallback)
    fallback = _align_slide_count_with_target(fallback, target_pages)
    return CoursewareOutline(
        title=fallback.title,
        sections=fallback.sections,
        total_slides=fallback.total_slides,
        summary="基础教学大纲",
    )
