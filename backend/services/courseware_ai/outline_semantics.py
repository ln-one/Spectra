"""Semantic helpers for separating outline content and teaching guidance."""

from __future__ import annotations

import re

from schemas.outline import CoursewareOutline, OutlineSection

CONTENT_FOCUS_ANCHORS = ("知识地图", "关键例题", "易错点澄清", "规律应用")
GUIDANCE_SIGNAL_TERMS = (
    "先让",
    "引导",
    "提问",
    "追问",
    "讨论",
    "板书",
    "导入",
    "过渡",
    "节奏",
    "互动",
    "组织学生",
    "展示答案",
)
KEY_POINT_FORBIDDEN_TERMS = (
    "互动提问",
    "板书逻辑",
    "板书主线",
    "课堂追问",
    "节奏推进",
    "导入方式",
)
CONTENT_SIGNAL_TERMS = (
    "概念",
    "定义",
    "关系",
    "原理",
    "条件",
    "步骤",
    "例题",
    "易错点",
    "规律",
    "结论",
    "公式",
    "结构",
    "图",
)
GUIDANCE_PREFIXES = ("板书主线", "板书逻辑", "导入", "互动提问", "课堂追问")


def _dedupe_non_empty(values: list[str]) -> list[str]:
    deduped: list[str] = []
    for value in values:
        normalized = str(value or "").strip()
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return deduped


def is_guidance_text(text: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    return any(token in normalized for token in GUIDANCE_SIGNAL_TERMS)


def is_content_text(text: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    if any(token in normalized for token in KEY_POINT_FORBIDDEN_TERMS):
        return False
    return any(token in normalized for token in CONTENT_SIGNAL_TERMS)


def split_semantic_item(text: str) -> tuple[list[str], list[str]]:
    normalized = str(text or "").strip().strip("。")
    if not normalized:
        return [], []

    for marker in ("：", ":"):
        if marker not in normalized:
            continue
        prefix, suffix = normalized.split(marker, 1)
        prefix = prefix.strip()
        suffix = suffix.strip()
        if prefix and suffix and any(token in prefix for token in GUIDANCE_PREFIXES):
            content = [
                chunk.strip()
                for chunk in re.split(r"[，,；;]", suffix)
                if chunk.strip() and is_content_text(chunk)
            ]
            if content:
                return _dedupe_non_empty(content), [normalized]

    if is_guidance_text(normalized) and not is_content_text(normalized):
        return [], [normalized]
    if is_content_text(normalized) and not is_guidance_text(normalized):
        return [normalized], []
    if any(token in normalized for token in KEY_POINT_FORBIDDEN_TERMS):
        return [], [normalized]
    return [normalized], []


def normalize_outline_semantics(outline: CoursewareOutline) -> CoursewareOutline:
    normalized_sections: list[OutlineSection] = []
    for section in list(outline.sections or []):
        content_points: list[str] = []
        guidance_points: list[str] = []

        for raw in list(section.key_points or []):
            content, guidance = split_semantic_item(raw)
            content_points.extend(content)
            guidance_points.extend(guidance)

        for raw in list(section.teaching_guidance or []):
            content, guidance = split_semantic_item(raw)
            guidance_points.extend(guidance)
            if content and not guidance:
                content_points.extend(content)

        normalized_sections.append(
            OutlineSection(
                title=section.title,
                key_points=_dedupe_non_empty(content_points),
                teaching_guidance=_dedupe_non_empty(guidance_points),
                slide_count=section.slide_count,
            )
        )

    return CoursewareOutline(
        title=outline.title,
        sections=normalized_sections,
        total_slides=outline.total_slides,
        summary=outline.summary,
    )
