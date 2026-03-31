"""课件大纲生成相关逻辑。"""

import asyncio
import json
import logging
import os
import re

from schemas.outline import CoursewareOutline, OutlineSection
from services.ai.model_router import ModelRouteTask
from services.courseware_ai.generation_support import retrieve_rag_context
from services.courseware_ai.outline_support import (
    align_slide_count_with_target,
    enrich_sparse_outline,
    extract_target_pages,
    inject_focus_anchors,
    is_outline_too_sparse,
    looks_low_quality_outline,
    reduce_outline_repetition,
)

logger = logging.getLogger(__name__)


def _rag_timeout_seconds() -> float:
    raw = os.getenv("OUTLINE_RAG_TIMEOUT_SECONDS")
    if raw is None or not str(raw).strip():
        raw = os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "90")
        try:
            return max(8.0, min(float(raw) / 3.0, 20.0))
        except ValueError:
            return 12.0
    try:
        parsed = float(str(raw).strip())
        return parsed if parsed > 0 else 12.0
    except ValueError:
        return 12.0


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

    rag_context = None
    try:
        rag_context = await asyncio.wait_for(
            retrieve_rag_context(
                ai_service,
                project_id,
                user_requirements,
                session_id=session_id,
                filters={"file_ids": rag_source_ids} if rag_source_ids else None,
            ),
            timeout=_rag_timeout_seconds(),
        )
    except Exception as exc:
        logger.warning("Outline RAG retrieval degraded to prompt-only mode: %s", exc)
        rag_context = None

    rag_hint = ""
    if rag_context:
        rag_hint = (
            "\n\n以下是从用户上传资料中检索到的参考内容，"
            "请据此优化大纲：\n" + _format_rag_context(rag_context)
        )
    rag_instruction = "参考内容请结合用户资料合理吸收。\n" if rag_context else ""

    style_desc = STYLE_REQUIREMENTS.get(template_style, STYLE_REQUIREMENTS["default"])
    target_pages = extract_target_pages(user_requirements)
    target_pages_constraint = (
        f"本次目标总页数：{target_pages} 页。章节 slide_count 总和应尽量等于该值。"
        if target_pages
        else "总页数通常控制在 10-20 页。"
    )

    prompt = f"""你是资深学科教学设计师。请先在内部完成“教学目标 -> 章节推进 -> 页数分配”的规划，再输出结构化课件大纲。
{rag_hint}
{rag_instruction}<outline_task>
  <template_style>{template_style}</template_style>
  <style_requirement>{style_desc}</style_requirement>
  <target_pages_rule>{target_pages_constraint}</target_pages_rule>
</outline_task>

<teacher_requirements>
{user_requirements}
</teacher_requirements>

<outline_contract>
仅返回 JSON：
{{
  "title": "课件标题",
  "sections": [
    {{"title": "章节标题", "key_points": ["要点A", "要点B"], "slide_count": 2}}
  ],
  "summary": "一句话总结"
}}
</outline_contract>

约束：
1. 章节数 3-8，完整覆盖教学流程（导入 -> 讲授 -> 案例/练习 -> 总结）。
2. 每章 3-6 个关键要点，且每章必须同时包含“互动提问”和“板书逻辑”相关要点。
3. 整体必须覆盖“知识地图”“关键例题”“易错点澄清”三类教学要素（至少各出现一次）。
4. {target_pages_constraint}
5. 章节标题不得重复，不得使用“核心知识点”“内容讲解”这类泛化标题。
6. 不同章节的关键要点不得直接重复或换说法原地复述，相邻章节必须体现教学推进。
7. 每章都要说明该章真正承担的教学任务，不要把多个章节写成同一类“概念堆砌”页面。
8. 如使用参考资料，优先吸收与当前教学目标直接相关的内容，不要因为资料命中就机械照抄原文。
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
        if is_outline_too_sparse(outline):
            logger.warning("Outline generation returned sparse structure, enriching")
            outline = enrich_sparse_outline(outline)
        if looks_low_quality_outline(outline):
            raise ValueError("LLM outline quality is too low")
        outline = reduce_outline_repetition(outline)
        outline = inject_focus_anchors(outline)
        outline = align_slide_count_with_target(outline, target_pages)
        return outline
    except Exception as exc:
        logger.exception("Outline generation failed: %s", exc)
        return ai_service._get_fallback_outline(user_requirements)
