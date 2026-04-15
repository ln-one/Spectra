"""Reusable Marp parsing helpers shared across services."""

from __future__ import annotations

import re

from services.generation.marp_document import split_marp_document


def parse_marp_slides(markdown_content: str) -> list[dict]:
    """Split Marp markdown into ordered slide records."""
    _frontmatter, _styles, raw_slides = split_marp_document(markdown_content or "")
    slides: list[dict] = []
    for index, raw in enumerate(raw_slides):
        if not raw:
            continue
        title_match = re.match(r"^#\s+(.+)$", raw, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else ""
        slides.append({"index": index, "title": title, "content": raw})
    return slides


def extract_frontmatter(markdown_content: str) -> str:
    """Extract Marp frontmatter block if present."""
    frontmatter, _styles, _slides = split_marp_document(markdown_content or "")
    return frontmatter


def reassemble_marp(frontmatter: str, slides: list[str]) -> str:
    """Compose Marp markdown from frontmatter and slide markdown bodies."""
    parts = [frontmatter.strip()] if str(frontmatter or "").strip() else []
    parts.extend(str(slide).strip() for slide in slides if str(slide).strip())
    if not parts:
        return ""
    return "\n\n---\n\n".join(parts) + "\n"

