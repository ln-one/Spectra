"""Word markdown projection."""

from __future__ import annotations

from typing import Any

from .sections import build_word_sections


def build_word_markdown(document_variant: str, payload: dict[str, Any]) -> str:
    lines = [f"# {payload['title']}", "", payload["summary"]]
    for section in build_word_sections(document_variant, payload):
        lines.extend(["", f"## {section['title']}", "", section["content"]])
    return "\n".join(lines).strip()
