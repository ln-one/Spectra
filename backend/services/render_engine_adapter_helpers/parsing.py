from __future__ import annotations

import re
from typing import Any, Optional

_PAGE_SPLIT_RE = re.compile(r"\n\s*---\s*\n")
_CLASS_COMMENT_RE = re.compile(r"<!--\s*_class:\s*([^>]+?)\s*-->", re.IGNORECASE)
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_IMAGE_RE = re.compile(r"!\[(.*?)\]\((.+?)\)")


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
        title = ""
        heading_match = _HEADING_RE.search(page_text)
        if heading_match:
            title = heading_match.group(2).strip()
        pages.append(
            {
                "title": title or None,
                "kind": infer_page_kind(page_text, index),
                "density": page_density(page_text),
                "blocks": parse_page_blocks(page_text),
            }
        )
    return pages or [
        {
            "title": None,
            "kind": "content",
            "density": None,
            "blocks": [{"type": "paragraph", "text": normalized or "Empty document"}],
        }
    ]
