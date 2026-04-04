"""Helpers for normalizing and splitting Marp markdown consistently."""

from __future__ import annotations

import re

_FRONTMATTER_RE = re.compile(r"^(---\s*\n[\s\S]*?\n---)\s*\n?")
_LEADING_STYLE_RE = re.compile(r"^(<style\b[^>]*>[\s\S]*?</style>)\s*", re.IGNORECASE)
_SLIDE_SEPARATOR_RE = re.compile(r"\n---\s*\n")
_TRAILING_SEPARATOR_RE = re.compile(r"(?:\n---\s*)+$")


def _strip_leading_style_blocks(content: str) -> tuple[str, str]:
    remaining = content.lstrip()
    blocks: list[str] = []
    while True:
        match = _LEADING_STYLE_RE.match(remaining)
        if not match:
            break
        blocks.append(match.group(1).strip())
        remaining = remaining[match.end() :].lstrip()
    return "\n\n".join(blocks).strip(), remaining


def split_marp_document(markdown: str) -> tuple[str, str, list[str]]:
    """Return ``frontmatter``, global ``style_blocks`` and slide bodies."""
    normalized = str(markdown or "").strip()
    frontmatter = ""
    body = normalized

    frontmatter_match = _FRONTMATTER_RE.match(normalized)
    if frontmatter_match:
        frontmatter = frontmatter_match.group(1).strip()
        body = normalized[frontmatter_match.end() :]

    style_blocks, body = _strip_leading_style_blocks(body)
    body = _TRAILING_SEPARATOR_RE.sub("", body.strip()).strip()

    slides = [
        segment.strip()
        for segment in _SLIDE_SEPARATOR_RE.split(body)
        if segment.strip()
    ]
    if not slides and body:
        slides = [body]
    return frontmatter, style_blocks, slides


def normalize_marp_markdown(markdown: str) -> str:
    """Normalize document structure without changing slide visual content."""
    frontmatter, style_blocks, slides = split_marp_document(markdown)

    body_parts: list[str] = []
    if slides:
        first_slide = slides[0]
        if style_blocks:
            first_slide = f"{style_blocks}\n\n{first_slide}"
        body_parts.append(first_slide.strip())
        body_parts.extend(slide.strip() for slide in slides[1:] if slide.strip())
    elif style_blocks:
        body_parts.append(style_blocks)

    body = "\n\n---\n\n".join(part for part in body_parts if part).strip()
    if frontmatter and body:
        return f"{frontmatter}\n\n{body}\n"
    if frontmatter:
        return f"{frontmatter}\n"
    if body:
        return f"{body}\n"
    return ""


def compose_single_slide_marp(
    frontmatter: str, style_blocks: str, slide_markdown: str
) -> str:
    slide_body = str(slide_markdown or "").strip()
    body_parts = [part for part in (style_blocks.strip(), slide_body) if part]
    body = "\n\n".join(body_parts).strip()

    if frontmatter and body:
        return f"{frontmatter.strip()}\n\n{body}\n"
    if frontmatter:
        return f"{frontmatter.strip()}\n"
    if body:
        return f"{body}\n"
    return ""
