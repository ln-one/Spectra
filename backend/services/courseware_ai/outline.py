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


def _normalize_title(title: str) -> str:
    return re.sub(r"\s+", "", str(title or "")).lower()


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

    total_slides = sum(section.slide_count for section in enriched) + 2
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
2. 每章 3-6 个关键要点，必须包含“互动提问”或“板书逻辑”相关要点。
3. 总页数通常控制在 10-20 页。
"""
    try:
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.OUTLINE_FORMATTING.value,
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
        total_slides = sum(section.slide_count for section in sections) + 2

        outline = CoursewareOutline(
            title=parsed.get("title", user_requirements[:50]),
            sections=sections,
            total_slides=total_slides,
            summary=parsed.get("summary"),
        )
        if _is_outline_too_sparse(outline):
            logger.warning("Outline generation returned sparse structure, enriching")
            return _enrich_sparse_outline(outline)
        return outline
    except Exception as exc:
        logger.warning("Outline generation failed: %s, using fallback", exc)
        return get_fallback_outline(user_requirements)


def get_fallback_outline(user_requirements: str) -> CoursewareOutline:
    """大纲生成失败时的兜底结果。"""
    return CoursewareOutline(
        title=user_requirements[:50],
        sections=[
            OutlineSection(
                title="导入",
                key_points=["主题引入", "学习动机", "互动提问", "板书框架"],
                slide_count=2,
            ),
            OutlineSection(
                title="核心概念",
                key_points=["关键概念", "原理讲解", "知识地图", "课堂追问"],
                slide_count=5,
            ),
            OutlineSection(
                title="练习与讨论",
                key_points=["关键例题", "课堂练习", "易错点澄清", "小组讨论"],
                slide_count=3,
            ),
            OutlineSection(
                title="总结",
                key_points=["要点回顾", "板书收束", "作业布置"],
                slide_count=2,
            ),
        ],
        total_slides=14,
        summary="基础教学大纲",
    )
