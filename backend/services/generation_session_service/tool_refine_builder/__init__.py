"""Tool refine builder package with legacy-compatible exports."""

from services.ai import ai_service

from .animation import refine_animation_content
from .common import (
    _find_mindmap_node,
    _load_rag_snippets,
    _require_manual_mindmap_title,
    _resolve_mindmap_target_id,
    _split_anchor,
)
from .dispatcher import build_structured_refine_artifact_content
from .interactive_games_legacy_adapter import (
    inject_legacy_game_html_section,
    refine_interactive_game_legacy_content,
)
from .game import _inject_html_section, refine_game_content
from .mindmap import refine_mindmap_content
from .quiz import refine_quiz_content
from .speaker_notes import refine_speaker_notes_content
from .word_document import refine_word_document_content

__all__ = [
    "ai_service",
    "build_structured_refine_artifact_content",
    "inject_legacy_game_html_section",
    "refine_animation_content",
    "refine_game_content",
    "refine_interactive_game_legacy_content",
    "refine_mindmap_content",
    "refine_quiz_content",
    "refine_speaker_notes_content",
    "refine_word_document_content",
    "_load_rag_snippets",
]
