"""Legacy Word document shaping helpers kept for compatibility-only adapter use."""

from .common import (
    WORD_DOCUMENT_VARIANTS,
    WORD_LAYOUT_VERSION,
    resolve_word_document_variant,
)
from .fallback import build_word_fallback_payload
from .html import render_word_doc_source_html, render_word_preview_html
from .markdown import build_word_markdown
from .payload import build_word_payload
from .schema import build_word_prompt, build_word_schema_hint
from .sections import build_word_sections
from .validation import validate_word_layout_payload

__all__ = [
    "WORD_DOCUMENT_VARIANTS",
    "WORD_LAYOUT_VERSION",
    "build_word_fallback_payload",
    "build_word_markdown",
    "build_word_payload",
    "build_word_prompt",
    "build_word_schema_hint",
    "build_word_sections",
    "render_word_doc_source_html",
    "render_word_preview_html",
    "resolve_word_document_variant",
    "validate_word_layout_payload",
]
