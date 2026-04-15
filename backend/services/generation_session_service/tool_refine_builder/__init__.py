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
from .game import _inject_html_section, refine_game_content
from .mindmap import refine_mindmap_content
from .quiz import refine_quiz_content
from .speaker_notes import _resolve_slide_page, refine_speaker_notes_content

__all__ = [
    "ai_service",
    "build_structured_refine_artifact_content",
    "refine_animation_content",
    "refine_game_content",
    "refine_mindmap_content",
    "refine_quiz_content",
    "refine_speaker_notes_content",
    "_load_rag_snippets",
]
