"""Interactive game template engine with legacy-compatible exports."""

from .fallback import build_game_fallback_data
from .rendering import render_game_html
from .schema import (
    TEMPLATE_GAME_PATTERNS,
    build_game_prompt,
    build_game_schema_hint,
    is_template_game_pattern,
    resolve_game_pattern,
    validate_game_data,
)

__all__ = [
    "TEMPLATE_GAME_PATTERNS",
    "build_game_fallback_data",
    "build_game_prompt",
    "build_game_schema_hint",
    "is_template_game_pattern",
    "render_game_html",
    "resolve_game_pattern",
    "validate_game_data",
]
