from __future__ import annotations

import re
from typing import Any, Optional

_PAGE_SPLIT_RE = re.compile(r"\n\s*---\s*\n")
_CLASS_COMMENT_RE = re.compile(r"<!--\s*_class:\s*([^>]+?)\s*-->", re.IGNORECASE)
_HEADING_RE = re.compile(r"(?m)^\s*(#{1,6})\s+(.+?)\s*$")
_IMAGE_RE = re.compile(r"!\[(.*?)\]\((.+?)\)")
_SUMMARY_KEYWORDS = ("总结", "小结", "回顾", "结语", "结论", "summary", "recap")
_OBJECTIVE_KEYWORDS = ("目标", "learning objective", "teaching objective")
_PROCESS_KEYWORDS = ("流程", "步骤", "过程", "链路", "工作流", "walkthrough")
_EXAMPLE_KEYWORDS = ("案例", "示例", "例题", "应用", "练习", "实验")
_CONCEPT_KEYWORDS = ("概念", "定义", "原理", "模型", "作用", "特点")


def _clean_inline_markdown(text: str) -> str:
    normalized = str(text or "").strip()
    normalized = re.sub(r"\*\*(.*?)\*\*", r"\1", normalized)
    normalized = re.sub(r"__(.*?)__", r"\1", normalized)
    normalized = re.sub(r"`([^`]+)`", r"\1", normalized)
    normalized = re.sub(r"^\s*>\s*", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _title_from_blocks(blocks: list[dict[str, Any]]) -> str:
    for block in blocks:
        if block.get("type") == "heading":
            return _clean_inline_markdown(str(block.get("text") or ""))
    return ""


def _secondary_headings(blocks: list[dict[str, Any]]) -> list[str]:
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
            text = _clean_inline_markdown(str(block.get("text") or ""))
            if text:
                headings.append(text)
    return headings


def _paragraphs(blocks: list[dict[str, Any]]) -> list[str]:
    return [
        _clean_inline_markdown(str(block.get("text") or ""))
        for block in blocks
        if block.get("type") == "paragraph"
        and _clean_inline_markdown(str(block.get("text") or ""))
    ]


def _bullet_items(blocks: list[dict[str, Any]]) -> list[str]:
    items: list[str] = []
    for block in blocks:
        if block.get("type") != "bullet_list":
            continue
        for item in block.get("items") or []:
            cleaned = _clean_inline_markdown(re.sub(r"^\d+\.\s*", "", str(item or "")))
            if cleaned:
                items.append(cleaned)
    return items


def _first_visual_block(blocks: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for block in blocks:
        if block.get("type") in {"image", "mermaid"}:
            return block
    return None


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
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
    cleaned_title = _clean_inline_markdown(title or _title_from_blocks(blocks))
    secondary_headings = _secondary_headings(blocks)
    paragraphs = _paragraphs(blocks)
    bullet_items = _bullet_items(blocks)
    visual_block = _first_visual_block(blocks)
    lowered_title = cleaned_title.lower()

    if base_kind == "cover":
        subtitle_candidates = [
            item
            for item in [*secondary_headings, *paragraphs]
            if item
            and "授课教师" not in item
            and "讲师" not in item
            and "主讲" not in item
        ]
        instructor = next(
            (
                item
                for item in [*secondary_headings, *paragraphs]
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
                    "sections": bullet_items or secondary_headings,
                    "current_section": (
                        (bullet_items or secondary_headings)[0]
                        if (bullet_items or secondary_headings)
                        else None
                    ),
                }
            },
        }

    if _contains_any(lowered_title, _SUMMARY_KEYWORDS) and bullet_items:
        return {
            "title": cleaned_title or None,
            "kind": "summary_page",
            "layout": "summary_page",
            "blocks": blocks,
            "structure": {
                "summary_page": {
                    "key_points": bullet_items,
                    "closing_note": paragraphs[0] if paragraphs else None,
                }
            },
        }

    if _contains_any(lowered_title, _OBJECTIVE_KEYWORDS) and bullet_items:
        return {
            "title": cleaned_title or None,
            "kind": "learning_objectives",
            "layout": "learning_objectives",
            "blocks": blocks,
            "structure": {
                "learning_objectives": {
                    "objectives": bullet_items,
                    "focus_label": (
                        secondary_headings[0] if secondary_headings else None
                    ),
                }
            },
        }

    if (
        _contains_any(lowered_title, _PROCESS_KEYWORDS)
        or any(block.get("ordered") for block in blocks)
    ) and bullet_items:
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
                    "steps": bullet_items,
                    "lead": (
                        paragraphs[0]
                        if paragraphs
                        else (secondary_headings[0] if secondary_headings else None)
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
                    "notes": bullet_items,
                    "caption": (
                        paragraphs[0]
                        if paragraphs
                        else (secondary_headings[0] if secondary_headings else None)
                    ),
                }
            },
        }

    if _contains_any(lowered_title, _EXAMPLE_KEYWORDS) and (paragraphs or bullet_items):
        return {
            "title": cleaned_title or None,
            "kind": "example_page",
            "layout": "example_page",
            "blocks": blocks,
            "structure": {
                "example_page": {
                    "scenario": paragraphs[0] if paragraphs else None,
                    "analysis_points": bullet_items,
                }
            },
        }

    if _contains_any(lowered_title, _CONCEPT_KEYWORDS) and (paragraphs or bullet_items):
        return {
            "title": cleaned_title or None,
            "kind": "concept_page",
            "layout": "concept_page",
            "blocks": blocks,
            "structure": {
                "concept_page": {
                    "definition": paragraphs[0] if paragraphs else None,
                    "takeaway": (
                        paragraphs[-1]
                        if len(paragraphs) > 1
                        else (bullet_items[0] if bullet_items else None)
                    ),
                }
            },
        }

    return {
        "title": cleaned_title or None,
        "kind": base_kind,
        "blocks": blocks,
    }


def strip_marp_frontmatter(markdown: str) -> str:
    text = str(markdown or "").strip()
    if not text.startswith("---"):
        return text
    parts = text.split("\n")
    if len(parts) < 3:
        return text
    if parts[0].strip() != "---":
        return text
    try:
        closing_index = parts[1:].index("---") + 1
    except ValueError:
        return text
    return "\n".join(parts[closing_index + 1 :]).strip()


def remove_html_style_blocks(markdown: str) -> str:
    return re.sub(r"<style[\s\S]*?</style>", "", markdown, flags=re.IGNORECASE)


def normalize_source_markdown(markdown: str) -> str:
    text = strip_marp_frontmatter(markdown)
    text = remove_html_style_blocks(text)
    return text.strip()


def infer_page_kind(page_text: str, index: int) -> str:
    class_match = _CLASS_COMMENT_RE.search(page_text)
    if class_match:
        class_tokens = class_match.group(1).split()
        for token in class_tokens:
            if token in {"cover", "toc", "content"}:
                return token
    if index == 0:
        return "cover"
    if re.search(r"(?m)^\s*#\s*(目录|contents?)\s*$", page_text, re.IGNORECASE):
        return "toc"
    return "content"


def page_density(page_text: str) -> Optional[str]:
    class_match = _CLASS_COMMENT_RE.search(page_text)
    if not class_match:
        return None
    for token in class_match.group(1).split():
        if token.startswith("density-"):
            return token
    return None


def stringify_block(block: dict[str, Any]) -> str:
    block_type = str(block.get("type") or "").strip()
    if block_type == "heading":
        level = block.get("level")
        try:
            heading_level = max(1, min(int(level or 2), 6))
        except (TypeError, ValueError):
            heading_level = 2
        text = str(block.get("text") or "").strip()
        return f'{"#" * heading_level} {text}'.strip()
    if block_type == "bullet_list":
        items = [
            str(item).strip()
            for item in (block.get("items") or [])
            if str(item).strip()
        ]
        marker = "1." if bool(block.get("ordered")) else "-"
        return "\n".join(f"{marker} {item}" for item in items)
    if block_type == "paragraph":
        return str(block.get("text") or "").strip()
    if block_type == "image":
        alt = str(block.get("alt") or "Image").strip() or "Image"
        src = str(block.get("src") or "").strip()
        return f"![{alt}]({src})" if src else ""
    if block_type == "mermaid":
        title = str(block.get("title") or "").strip()
        code = str(block.get("code") or "").strip()
        parts = []
        if title:
            parts.append(f"### {title}")
        parts.append("```mermaid")
        parts.append(code)
        parts.append("```")
        return "\n".join(part for part in parts if part)
    return ""


def build_page_markdown(page_payload: dict[str, Any]) -> str:
    parts: list[str] = []
    title = str(page_payload.get("title") or "").strip()
    blocks = page_payload.get("blocks") or []
    if title and not any(
        isinstance(block, dict) and str(block.get("type") or "") == "heading"
        for block in blocks
    ):
        parts.append(f"# {title}")

    for block in blocks:
        if isinstance(block, dict):
            rendered = stringify_block(block)
            if rendered.strip():
                parts.append(rendered.strip())

    return "\n\n".join(part for part in parts if part).strip()


def parse_page_blocks(page_text: str) -> list[dict]:
    blocks: list[dict] = []
    lines = [line.rstrip() for line in page_text.splitlines()]
    paragraph_buffer: list[str] = []
    mermaid_buffer: list[str] | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        text = "\n".join(line for line in paragraph_buffer if line.strip()).strip()
        paragraph_buffer = []
        if text:
            blocks.append({"type": "paragraph", "text": text})

    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        idx += 1
        if not line or line.startswith("<!-- _class:"):
            flush_paragraph()
            continue
        if mermaid_buffer is not None:
            if line == "```":
                blocks.append({"type": "mermaid", "code": "\n".join(mermaid_buffer)})
                mermaid_buffer = None
            else:
                mermaid_buffer.append(lines[idx - 1])
            continue
        if line == "```mermaid":
            flush_paragraph()
            mermaid_buffer = []
            continue
        heading_match = _HEADING_RE.match(line)
        if heading_match:
            flush_paragraph()
            blocks.append(
                {
                    "type": "heading",
                    "level": len(heading_match.group(1)),
                    "text": heading_match.group(2).strip(),
                }
            )
            continue
        if line.startswith("- ") or re.match(r"^\d+\.\s+", line):
            flush_paragraph()
            items = [re.sub(r"^(?:-\s+|\d+\.\s+)", "", line).strip()]
            ordered = bool(re.match(r"^\d+\.\s+", line))
            while idx < len(lines):
                candidate = lines[idx].strip()
                if ordered and re.match(r"^\d+\.\s+", candidate):
                    items.append(re.sub(r"^\d+\.\s+", "", candidate).strip())
                    idx += 1
                    continue
                if not ordered and candidate.startswith("- "):
                    items.append(candidate[2:].strip())
                    idx += 1
                    continue
                break
            blocks.append({"type": "bullet_list", "items": items, "ordered": ordered})
            continue
        image_match = _IMAGE_RE.search(line)
        if image_match:
            flush_paragraph()
            blocks.append(
                {
                    "type": "image",
                    "alt": image_match.group(1).strip() or "Image",
                    "src": image_match.group(2).strip(),
                }
            )
            continue
        paragraph_buffer.append(lines[idx - 1])

    flush_paragraph()
    if mermaid_buffer is not None:
        blocks.append(
            {"type": "paragraph", "text": "```mermaid\n" + "\n".join(mermaid_buffer)}
        )
    return blocks or [{"type": "paragraph", "text": page_text.strip()}]


def parse_document_pages(markdown: str) -> list[dict[str, Any]]:
    normalized = normalize_source_markdown(markdown)
    raw_pages = [
        chunk.strip() for chunk in _PAGE_SPLIT_RE.split(normalized) if chunk.strip()
    ]
    pages: list[dict[str, Any]] = []
    for index, page_text in enumerate(raw_pages):
        blocks = parse_page_blocks(page_text)
        heading_match = _HEADING_RE.search(page_text)
        title = (
            _clean_inline_markdown(heading_match.group(2))
            if heading_match
            else _title_from_blocks(blocks)
        )
        base_kind = infer_page_kind(page_text, index)
        page_payload = infer_page_semantics(
            page_text=page_text,
            index=index,
            base_kind=base_kind,
            blocks=blocks,
            title=title,
        )
        page_payload["density"] = page_density(page_text)
        pages.append(page_payload)
    return pages or [
        {
            "title": None,
            "kind": "content",
            "density": None,
            "blocks": [{"type": "paragraph", "text": normalized or "Empty document"}],
        }
    ]
