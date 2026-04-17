"""Compatibility facade for Spectra-side Pagevra parsing helpers.

Parsing, markdown normalization, and page semantic inference live in smaller
modules so the adapter remains an anti-corruption layer instead of a hidden
render domain owner.
"""

from __future__ import annotations

from typing import Any

from .blocks import (
    HEADING_RE,
    build_page_markdown,
    clean_inline_markdown,
    infer_page_kind,
    page_density,
    parse_page_blocks,
    title_from_blocks,
)
from .markdown import PAGE_SPLIT_RE, normalize_source_markdown
from .semantics import infer_page_semantics


def parse_document_pages(markdown: str) -> list[dict[str, Any]]:
    normalized = normalize_source_markdown(markdown)
    raw_pages = [
        chunk.strip() for chunk in PAGE_SPLIT_RE.split(normalized) if chunk.strip()
    ]
    pages: list[dict[str, Any]] = []
    for index, page_text in enumerate(raw_pages):
        blocks = parse_page_blocks(page_text)
        heading_match = HEADING_RE.search(page_text)
        title = (
            clean_inline_markdown(heading_match.group(2))
            if heading_match
            else title_from_blocks(blocks)
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


__all__ = [
    "build_page_markdown",
    "infer_page_semantics",
    "normalize_source_markdown",
    "parse_document_pages",
    "parse_page_blocks",
]
