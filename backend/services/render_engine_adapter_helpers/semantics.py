from __future__ import annotations

from typing import Any, Optional

from .blocks import clean_inline_markdown, title_from_blocks

SUMMARY_KEYWORDS = ("总结", "小结", "回顾", "结语", "结论", "summary", "recap")
OBJECTIVE_KEYWORDS = ("目标", "learning objective", "teaching objective")
PROCESS_KEYWORDS = ("流程", "步骤", "过程", "链路", "工作流", "walkthrough")
EXAMPLE_KEYWORDS = ("案例", "示例", "例题", "应用", "练习", "实验")
CONCEPT_KEYWORDS = ("概念", "定义", "原理", "模型", "作用", "特点")


def secondary_headings(blocks: list[dict[str, Any]]) -> list[str]:
    headings: list[str] = []
    for block in blocks:
        if block.get("type") != "heading":
            continue
        level = block.get("level")
        try:
            heading_level = int(level or 2)
        except (TypeError, ValueError):
            heading_level = 2
        if heading_level >= 2:
            text = clean_inline_markdown(str(block.get("text") or ""))
            if text:
                headings.append(text)
    return headings


def paragraphs(blocks: list[dict[str, Any]]) -> list[str]:
    return [
        clean_inline_markdown(str(block.get("text") or ""))
        for block in blocks
        if block.get("type") == "paragraph"
        and clean_inline_markdown(str(block.get("text") or ""))
    ]


def bullet_items(blocks: list[dict[str, Any]]) -> list[str]:
    items: list[str] = []
    for block in blocks:
        if block.get("type") != "bullet_list":
            continue
        for item in block.get("items") or []:
            cleaned = clean_inline_markdown(str(item or ""))
            if cleaned:
                items.append(cleaned)
    return items


def first_visual_block(blocks: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for block in blocks:
        if block.get("type") in {"image", "mermaid"}:
            return block
    return None


def contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    normalized = str(text or "").strip().lower()
    return any(keyword in normalized for keyword in keywords)


def infer_page_semantics(
    *,
    page_text: str,
    index: int,
    base_kind: str,
    blocks: list[dict[str, Any]],
    title: str,
) -> dict[str, Any]:
    cleaned_title = clean_inline_markdown(title or title_from_blocks(blocks))
    derived_secondary_headings = secondary_headings(blocks)
    derived_paragraphs = paragraphs(blocks)
    derived_bullet_items = bullet_items(blocks)
    visual_block = first_visual_block(blocks)
    lowered_title = cleaned_title.lower()

    if base_kind == "cover":
        subtitle_candidates = [
            item
            for item in [*derived_secondary_headings, *derived_paragraphs]
            if item
            and "授课教师" not in item
            and "讲师" not in item
            and "主讲" not in item
        ]
        instructor = next(
            (
                item
                for item in [*derived_secondary_headings, *derived_paragraphs]
                if any(token in item for token in ("授课教师", "讲师", "主讲", "教师"))
            ),
            None,
        )
        return {
            "title": cleaned_title or None,
            "kind": "chapter_cover",
            "layout": "chapter_cover",
            "blocks": blocks,
            "layout_hints": {"emphasis_level": "high"},
            "structure": {
                "chapter_cover": {
                    "course_title": cleaned_title or None,
                    "subtitle": subtitle_candidates[0] if subtitle_candidates else None,
                    "instructor": instructor,
                }
            },
        }

    if base_kind == "toc":
        return {
            "title": cleaned_title or None,
            "kind": "chapter_agenda",
            "layout": "chapter_agenda",
            "blocks": blocks,
            "structure": {
                "chapter_agenda": {
                    "sections": derived_bullet_items or derived_secondary_headings,
                    "current_section": (
                        (derived_bullet_items or derived_secondary_headings)[0]
                        if (derived_bullet_items or derived_secondary_headings)
                        else None
                    ),
                }
            },
        }

    if contains_any(lowered_title, SUMMARY_KEYWORDS) and derived_bullet_items:
        return {
            "title": cleaned_title or None,
            "kind": "summary_page",
            "layout": "summary_page",
            "blocks": blocks,
            "structure": {
                "summary_page": {
                    "key_points": derived_bullet_items,
                    "closing_note": (
                        derived_paragraphs[0] if derived_paragraphs else None
                    ),
                }
            },
        }

    if contains_any(lowered_title, OBJECTIVE_KEYWORDS) and derived_bullet_items:
        return {
            "title": cleaned_title or None,
            "kind": "learning_objectives",
            "layout": "learning_objectives",
            "blocks": blocks,
            "structure": {
                "learning_objectives": {
                    "objectives": derived_bullet_items,
                    "focus_label": (
                        derived_secondary_headings[0]
                        if derived_secondary_headings
                        else None
                    ),
                }
            },
        }

    if (
        contains_any(lowered_title, PROCESS_KEYWORDS)
        or any(block.get("ordered") for block in blocks)
    ) and derived_bullet_items:
        return {
            "title": cleaned_title or None,
            "kind": "process_walkthrough",
            "layout": "process_walkthrough",
            "blocks": blocks,
            "layout_hints": {
                "visual_priority": "balanced" if visual_block else "text",
            },
            "structure": {
                "process_walkthrough": {
                    "steps": derived_bullet_items,
                    "lead": (
                        derived_paragraphs[0]
                        if derived_paragraphs
                        else (
                            derived_secondary_headings[0]
                            if derived_secondary_headings
                            else None
                        )
                    ),
                }
            },
        }

    if visual_block is not None:
        return {
            "title": cleaned_title or None,
            "kind": "diagram_explainer",
            "layout": "diagram_explainer",
            "blocks": blocks,
            "layout_hints": {"visual_priority": "visual"},
            "structure": {
                "diagram_explainer": {
                    "notes": derived_bullet_items,
                    "caption": (
                        derived_paragraphs[0]
                        if derived_paragraphs
                        else (
                            derived_secondary_headings[0]
                            if derived_secondary_headings
                            else None
                        )
                    ),
                }
            },
        }

    if contains_any(lowered_title, EXAMPLE_KEYWORDS) and (
        derived_paragraphs or derived_bullet_items
    ):
        return {
            "title": cleaned_title or None,
            "kind": "example_page",
            "layout": "example_page",
            "blocks": blocks,
            "structure": {
                "example_page": {
                    "scenario": derived_paragraphs[0] if derived_paragraphs else None,
                    "analysis_points": derived_bullet_items,
                }
            },
        }

    if contains_any(lowered_title, CONCEPT_KEYWORDS) and (
        derived_paragraphs or derived_bullet_items
    ):
        return {
            "title": cleaned_title or None,
            "kind": "concept_page",
            "layout": "concept_page",
            "blocks": blocks,
            "structure": {
                "concept_page": {
                    "definition": derived_paragraphs[0] if derived_paragraphs else None,
                    "takeaway": (
                        derived_paragraphs[-1]
                        if len(derived_paragraphs) > 1
                        else (
                            derived_bullet_items[0]
                            if derived_bullet_items
                            else None
                        )
                    ),
                }
            },
        }

    return {
        "title": cleaned_title or None,
        "kind": base_kind,
        "blocks": blocks,
    }
