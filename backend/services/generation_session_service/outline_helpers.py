from __future__ import annotations

import re
import uuid
from typing import Optional

_SLIDE_FOCUS_SUFFIX = ("知识地图", "关键例题", "易错点澄清", "互动提问", "板书逻辑")
_MIN_KEY_POINTS_PER_SLIDE = 3
_EXTRA_PAGE_SCAFFOLD = (
    (
        "知识地图扩展",
        ["核心概念关系图", "主线知识串联", "板书结构搭建"],
    ),
    (
        "关键例题扩展",
        ["例题拆解步骤", "方法迁移训练", "变式题即时反馈"],
    ),
    (
        "易错点澄清扩展",
        ["高频误区识别", "反例对比纠偏", "课堂追问与修正"],
    ),
    (
        "互动提问扩展",
        ["问题链设计", "学生讨论任务", "板书总结归纳"],
    ),
)

_OUTLINE_STYLE_RULES = {
    "structured": (
        "采用“总-分-总”结构：导入总览 -> 分章节展开 -> 结语总结；"
        "章节标题体现层级关系，优先使用概念递进。"
    ),
    "story": (
        "采用叙事引导结构：情境引入 -> 冲突/问题出现 -> 知识揭示 -> 迁移应用；"
        "每章保持故事线连续。"
    ),
    "problem": (
        "采用问题驱动结构：每章以问题开场，随后给出分析路径、结论与小练习；"
        "问题之间应形成问题链。"
    ),
    "workshop": (
        "采用实操工作坊结构：任务目标 -> 操作步骤 -> 案例演示 -> 练习复盘；"
        "强调可执行步骤与课堂活动。"
    ),
}


def _sanitize_key_points(key_points: list[str] | None) -> list[str]:
    values = [str(point).strip() for point in (key_points or []) if str(point).strip()]
    deduped: list[str] = []
    for point in values:
        if point not in deduped:
            deduped.append(point)
    while len(deduped) < _MIN_KEY_POINTS_PER_SLIDE:
        fallback_idx = len(deduped)
        if fallback_idx == 0:
            deduped.append("核心概念梳理")
        elif fallback_idx == 1:
            deduped.append("关键例题讲解")
        elif fallback_idx == 2:
            deduped.append("易错点澄清与互动提问")
        else:
            deduped.append(f"补充要点 {fallback_idx + 1}")
    return deduped


def _build_split_slide_title(base_title: str, idx: int, total: int) -> str:
    if total <= 1:
        return base_title
    suffix = _SLIDE_FOCUS_SUFFIX[idx % len(_SLIDE_FOCUS_SUFFIX)]
    return f"{base_title} · {suffix}"


def _extract_outline_style(options: Optional[dict]) -> Optional[str]:
    if not options:
        return None

    explicit = str(options.get("outline_style") or "").strip().lower()
    if explicit in _OUTLINE_STYLE_RULES:
        return explicit

    tone = str(options.get("system_prompt_tone") or "")
    if not tone:
        return None

    token_match = re.search(
        r"\[\s*outline_style\s*=\s*(structured|story|problem|workshop)\s*\]",
        tone,
        re.IGNORECASE,
    )
    if token_match:
        return token_match.group(1).lower()

    if any(keyword in tone for keyword in ("总-分-总", "总分总", "层次分明")):
        return "structured"
    if any(keyword in tone for keyword in ("叙事", "故事", "情境引入")):
        return "story"
    if any(keyword in tone for keyword in ("问题驱动", "问题链", "启发式")):
        return "problem"
    if any(keyword in tone for keyword in ("实操", "工作坊", "案例化", "可落地")):
        return "workshop"

    return None


def _build_outline_requirements(
    project,
    options: Optional[dict],
) -> str:
    parts = []
    if project:
        if getattr(project, "name", None):
            parts.append(f"项目名称：{project.name}")
        if getattr(project, "description", None):
            parts.append(f"项目描述：{project.description}")

    if options:
        if options.get("outline_redraft_instruction"):
            parts.append(f"大纲重写要求：{options['outline_redraft_instruction']}")
        if options.get("system_prompt_tone"):
            parts.append(f"用户需求：{options['system_prompt_tone']}")
        if options.get("pages"):
            parts.append(f"目标页数：{options['pages']}")
        if options.get("audience"):
            parts.append(f"目标受众：{options['audience']}")
        if options.get("target_duration_minutes"):
            parts.append(f"目标时长：{options['target_duration_minutes']} 分钟")
        outline_style = _extract_outline_style(options)
        if outline_style:
            parts.append(f"大纲风格ID：{outline_style}")
            parts.append("大纲风格硬约束（必须遵循）：")
            parts.append(_OUTLINE_STYLE_RULES[outline_style])

    return "\n".join(parts).strip() or "生成课件大纲"


def _courseware_outline_to_document(
    outline, target_pages: Optional[int] = None
) -> dict:
    nodes = []
    order = 1
    for section in outline.sections:
        count = section.slide_count or 1
        base_key_points = _sanitize_key_points(list(section.key_points or []))
        for idx in range(count):
            title = _build_split_slide_title(str(section.title or "章节"), idx, count)
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": title,
                    "key_points": base_key_points,
                    "estimated_minutes": None,
                }
            )
            order += 1

    if target_pages and len(nodes) < target_pages:
        while len(nodes) < target_pages:
            template_idx = (len(nodes) - 1) % len(_EXTRA_PAGE_SCAFFOLD)
            template_title, template_points = _EXTRA_PAGE_SCAFFOLD[template_idx]
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": f"{template_title} {order}",
                    "key_points": _sanitize_key_points(list(template_points)),
                    "estimated_minutes": None,
                }
            )
            order += 1

    return {
        "version": 1,
        "nodes": nodes,
        "summary": getattr(outline, "summary", None),
    }
