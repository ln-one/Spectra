from __future__ import annotations

import re
import uuid
from typing import Optional

from services.generation_session_service.teaching_brief import (
    build_brief_prompt_hint,
    extract_brief_fields_from_options,
)

_SLIDE_FOCUS_SUFFIX = ("知识地图", "关键例题", "易错点澄清", "互动提问")
_SLIDE_FOCUS_POINTS = {
    "知识地图": "知识地图结构化梳理",
    "关键例题": "关键例题讲解与方法迁移",
    "易错点澄清": "易错点澄清与纠偏",
    "互动提问": "互动提问与即时反馈",
}
_MIN_KEY_POINTS_PER_SLIDE = 3
_EXTRA_PAGE_SCAFFOLD = (
    (
        "知识地图扩展",
        ["核心概念关系图", "主线知识串联", "结构化讲解路径"],
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
        ["问题链设计", "学生讨论任务", "课堂总结归纳"],
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
    return f"{base_title}（{idx + 1}/{total}）"


def _pick_slide_focus_label(base_key_points: list[str], idx: int) -> str | None:
    points = _sanitize_key_points(base_key_points)
    if not points:
        return None
    return points[idx % len(points)]


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    deduped: list[str] = []
    for item in items:
        if item not in deduped:
            deduped.append(item)
    return deduped


def _build_split_slide_title_with_focus(
    base_title: str,
    base_key_points: list[str],
    idx: int,
    total: int,
) -> str:
    if total <= 1:
        return base_title

    focus_label = str(_pick_slide_focus_label(base_key_points, idx) or "").strip()
    if not focus_label or focus_label in base_title:
        return _build_split_slide_title(base_title, idx, total)

    title = f"{base_title}：{focus_label}"
    duplicate_focuses = [
        _pick_slide_focus_label(base_key_points, cursor) for cursor in range(total)
    ]
    if duplicate_focuses.count(focus_label) > 1:
        return f"{title}（{idx + 1}/{total}）"
    return title


def _build_slide_key_points(
    base_key_points: list[str], idx: int, total: int
) -> list[str]:
    points = _sanitize_key_points(base_key_points)
    if total <= 1:
        return points

    window_size = min(max(_MIN_KEY_POINTS_PER_SLIDE, 3), max(len(points), 1))
    start = min(idx, max(len(points) - 1, 0))
    selected: list[str] = []
    cursor = start
    while len(selected) < min(window_size, len(points)):
        selected.append(points[cursor % len(points)])
        cursor += 1

    focus = _SLIDE_FOCUS_SUFFIX[idx % len(_SLIDE_FOCUS_SUFFIX)]
    focus_point = _SLIDE_FOCUS_POINTS.get(focus)
    if focus_point and not any(focus in point for point in selected):
        selected.append(focus_point)
    return _sanitize_key_points(_dedupe_preserve_order(selected))


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
    brief_fields = extract_brief_fields_from_options(options or {})
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
        audience = options.get("audience") or brief_fields.get("audience")
        if audience:
            parts.append(f"目标受众：{audience}")
        duration_minutes = options.get("target_duration_minutes") or brief_fields.get(
            "target_duration_minutes"
        )
        if duration_minutes:
            parts.append(f"目标时长：{duration_minutes} 分钟")
        outline_style = _extract_outline_style(options)
        if outline_style:
            parts.append(f"大纲风格ID：{outline_style}")
            parts.append("大纲风格硬约束（必须遵循）：")
            parts.append(_OUTLINE_STYLE_RULES[outline_style])
        brief_hint = build_brief_prompt_hint(options)
        if brief_hint:
            parts.append("教学需求单：")
            parts.append(brief_hint)

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
            title = _build_split_slide_title_with_focus(
                str(section.title or "章节"),
                base_key_points,
                idx,
                count,
            )
            key_points = _build_slide_key_points(base_key_points, idx, count)
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": title,
                    "key_points": key_points,
                    "estimated_minutes": None,
                }
            )
            order += 1

    normalized_target_pages = None
    if target_pages is not None:
        try:
            parsed_target_pages = int(target_pages)
            normalized_target_pages = (
                parsed_target_pages if parsed_target_pages > 0 else None
            )
        except (TypeError, ValueError):
            normalized_target_pages = None

    if normalized_target_pages and len(nodes) < normalized_target_pages:
        while len(nodes) < normalized_target_pages:
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
    elif normalized_target_pages and len(nodes) > normalized_target_pages:
        nodes = nodes[:normalized_target_pages]

    for idx, node in enumerate(nodes, start=1):
        node["order"] = idx

    return {
        "version": 1,
        "nodes": nodes,
        "summary": getattr(outline, "summary", None),
    }
