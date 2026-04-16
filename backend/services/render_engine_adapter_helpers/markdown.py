from __future__ import annotations

import re

PAGE_SPLIT_RE = re.compile(r"\n\s*---\s*\n")
CLASS_COMMENT_RE = re.compile(r"<!--\s*_class:\s*([^>]+?)\s*-->", re.IGNORECASE)


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
