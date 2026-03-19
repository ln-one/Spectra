"""课件大纲生成相关逻辑。"""

import json
import logging
import re

from schemas.outline import CoursewareOutline, OutlineSection
from services.model_router import ModelRouteTask

logger = logging.getLogger(__name__)


async def generate_outline(
    ai_service,
    project_id: str,
    user_requirements: str,
    template_style: str = "default",
) -> CoursewareOutline:
    """根据需求生成结构化课件大纲。"""
    from services.prompt_service import STYLE_REQUIREMENTS, _format_rag_context

    rag_context = await ai_service._retrieve_rag_context(project_id, user_requirements)

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
1. 章节数 3-8，完整覆盖教学流程（导入 -> 讲授 -> 练习 -> 总结）。
2. 每章 2-5 个关键要点。
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

        return CoursewareOutline(
            title=parsed.get("title", user_requirements[:50]),
            sections=sections,
            total_slides=total_slides,
            summary=parsed.get("summary"),
        )
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
                key_points=["主题引入", "学习动机"],
                slide_count=2,
            ),
            OutlineSection(
                title="核心概念",
                key_points=["关键概念", "示例讲解"],
                slide_count=5,
            ),
            OutlineSection(
                title="练习与讨论",
                key_points=["课堂练习", "小组讨论"],
                slide_count=3,
            ),
            OutlineSection(
                title="总结",
                key_points=["要点回顾", "作业布置"],
                slide_count=2,
            ),
        ],
        total_slides=14,
        summary="基础教学大纲",
    )
