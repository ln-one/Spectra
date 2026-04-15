"""Tool content fallback package with legacy-compatible exports."""

from .animation import fallback_animation_content
from .common import SUPPORTED_CARD_IDS, card_query_text
from .courseware import fallback_courseware_ppt_content, fallback_quiz_content
from .dispatch import fallback_content
from .game import fallback_game_content
from .mindmap import fallback_mindmap_content
from .simulator import (
    fallback_simulator_content,
    fallback_simulator_turn_result,
    next_turn_anchor,
)
from .speaker_notes import fallback_speaker_notes_content
from .word import fallback_word_document_content

__all__ = [
    "SUPPORTED_CARD_IDS",
    "card_query_text",
    "fallback_animation_content",
    "fallback_content",
    "fallback_courseware_ppt_content",
    "fallback_game_content",
    "fallback_mindmap_content",
    "fallback_quiz_content",
    "fallback_simulator_content",
    "fallback_simulator_turn_result",
    "fallback_speaker_notes_content",
    "fallback_word_document_content",
    "next_turn_anchor",
]
