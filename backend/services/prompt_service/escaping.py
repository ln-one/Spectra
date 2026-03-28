"""Escaping helpers for pseudo-XML prompt sections."""

from __future__ import annotations

from html import escape
from typing import Any


def escape_prompt_text(value: Any) -> str:
    """Escape user- and retrieval-controlled text before embedding in prompt tags."""
    if value is None:
        return ""
    return escape(str(value), quote=True)
