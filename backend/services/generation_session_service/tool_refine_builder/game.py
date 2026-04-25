"""Legacy compatibility wrapper for the frozen interactive game refine path."""

from __future__ import annotations

from .interactive_games_legacy_adapter import (
    inject_legacy_game_html_section as _inject_html_section,
)
from .interactive_games_legacy_adapter import (
    refine_interactive_game_legacy_content as refine_game_content,
)
