"""Outline quality heuristics and deterministic fallback builders."""

import logging
import re

from schemas.outline import CoursewareOutline, OutlineSection

logger = logging.getLogger(__name__)

SCAFFOLD_SECTIONS = [
    ("导入与目标", ["主题引入", "学习目标", "先验知识唤醒", "课堂提问起点"], 2),
    ("核心概念", ["关键概念", "原理讲解", "知识结构梳理", "板书主线"], 3),
    ("案例与应用", ["典型案例", "应用场景", "易错点辨析", "变式题训练"], 3),
    ("练习与总结", ["课堂练习", "结果反馈", "总结迁移", "提问回扣"], 2),
]
FOCUS_ANCHORS = ("知识地图", "关键例题", "易错点澄清", "互动提问", "板书逻辑")
GENERIC_TITLE_PATTERNS = (
    "核心知识点",
    "知识点",
    "内容讲解",
    "课程内容",
    "章节",
)


def _normalize_outline_text(text: str) -> str:
    return normalize_outline_title(text)


def _dedupe_points(points: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for point in points:
        normalized = _normalize_outline_text(point)
        if not normalized or normalized in seen:
            continue
        deduped.append(point)
        seen.add(normalized)
    return deduped


def _make_unique_section_title(
    title: str,
    key_points: list[str],
    used_titles: set[str],
    anchor: str,
) -> str:
    candidate = str(title or "").strip() or "章节"
    normalized = _normalize_outline_text(candidate)
    if normalized and normalized not in used_titles:
        used_titles.add(normalized)
        return candidate

    suffix = next(
        (point for point in key_points if point and not is_placeholder_point(point)),
        anchor,
    )
    remapped = f"{candidate}：{suffix}"
    normalized_remapped = _normalize_outline_text(remapped)
    if normalized_remapped in used_titles:
        remapped = f"{candidate}：{anchor}"
        normalized_remapped = _normalize_outline_text(remapped)
    used_titles.add(normalized_remapped)
    return remapped


def normalize_outline_title(title: str) -> str:
    return re.sub(r"\s+", "", str(title or "")).lower()


def extract_target_pages(user_requirements: str) -> int | None:
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


def contains_anchor(text: str, anchor: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    return anchor in normalized


def is_generic_title(title: str) -> bool:
    normalized = normalize_outline_title(title)
    compact = re.sub(r"\d+", "", normalized)
    return any(pattern in compact for pattern in GENERIC_TITLE_PATTERNS)


def is_placeholder_point(point: str) -> bool:
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


def looks_low_quality_outline(outline: CoursewareOutline) -> bool:
    sections = list(outline.sections or [])
    if not sections:
        return True

    generic_title_count = sum(is_generic_title(section.title) for section in sections)
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
    placeholder_ratio = sum(is_placeholder_point(point) for point in key_points) / max(
        len(key_points), 1
    )
    if placeholder_ratio >= 0.5:
        return True
    return False


def inject_focus_anchors(outline: CoursewareOutline) -> CoursewareOutline:
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
            key_points.append(f"{section.title}互动提问")
        if not any("板书" in point for point in key_points):
            key_points.append(f"{section.title}板书逻辑")
        anchor = FOCUS_ANCHORS[idx % len(FOCUS_ANCHORS)]
        if not any(contains_anchor(point, anchor) for point in key_points):
            key_points.append(anchor)

        deduped_points = _dedupe_points(key_points)
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


def reduce_outline_repetition(outline: CoursewareOutline) -> CoursewareOutline:
    sections = list(outline.sections or [])
    if not sections:
        return outline

    reduced_sections: list[OutlineSection] = []
    used_titles: set[str] = set()
    seen_points: set[str] = set()

    for idx, section in enumerate(sections):
        raw_points = [
            str(point).strip()
            for point in (section.key_points or [])
            if str(point).strip()
        ]
        unique_points: list[str] = []
        for point in raw_points:
            normalized = _normalize_outline_text(point)
            if not normalized:
                continue
            if normalized in seen_points:
                continue
            unique_points.append(point)
            seen_points.add(normalized)

        if len(unique_points) < 2:
            anchor = FOCUS_ANCHORS[idx % len(FOCUS_ANCHORS)]
            fallback_points = [
                f"{section.title}关键内容",
                f"{section.title}课堂推进",
                anchor,
            ]
            for point in fallback_points:
                normalized = _normalize_outline_text(point)
                if normalized in seen_points:
                    continue
                unique_points.append(point)
                seen_points.add(normalized)
                if len(unique_points) >= 3:
                    break

        title = _make_unique_section_title(
            section.title,
            unique_points,
            used_titles,
            FOCUS_ANCHORS[idx % len(FOCUS_ANCHORS)],
        )
        reduced_sections.append(
            OutlineSection(
                title=title,
                key_points=_dedupe_points(unique_points)[:6],
                slide_count=max(int(section.slide_count or 0), 2),
            )
        )

    return CoursewareOutline(
        title=outline.title,
        sections=reduced_sections,
        total_slides=sum(item.slide_count for item in reduced_sections),
        summary=outline.summary,
    )


def align_slide_count_with_target(
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


def is_outline_too_sparse(outline: CoursewareOutline) -> bool:
    sections = list(outline.sections or [])
    if len(sections) < 3:
        return True
    total_key_points = sum(len(section.key_points or []) for section in sections)
    if total_key_points < max(9, len(sections) * 3):
        return True
    distinct_titles = {normalize_outline_title(section.title) for section in sections}
    if len(distinct_titles) < min(3, len(sections)):
        return True
    if any(len(section.key_points or []) < 3 for section in sections):
        return True
    return False


def enrich_sparse_outline(outline: CoursewareOutline) -> CoursewareOutline:
    sections = list(outline.sections or [])
    enriched: list[OutlineSection] = []
    used_titles = set()

    for section in sections:
        title = str(section.title or "").strip() or "章节"
        normalized_title = normalize_outline_title(title)
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
                    for scaffold_title, points, _count in SCAFFOLD_SECTIONS
                    if any(
                        token in normalized_title
                        for token in (normalize_outline_title(scaffold_title),)
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

    existing_titles = {normalize_outline_title(section.title) for section in enriched}
    for title, key_points, slide_count in SCAFFOLD_SECTIONS:
        normalized_title = normalize_outline_title(title)
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
