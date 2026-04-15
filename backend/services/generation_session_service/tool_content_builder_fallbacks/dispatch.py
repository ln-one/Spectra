"""Card fallback dispatcher."""

from __future__ import annotations

from typing import Any

from .animation import fallback_animation_content
from .courseware import fallback_courseware_ppt_content, fallback_quiz_content
from .game import fallback_game_content
from .mindmap import fallback_mindmap_content
from .simulator import fallback_simulator_content
from .speaker_notes import fallback_speaker_notes_content
from .word import fallback_word_document_content


def fallback_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None = None,
    source_artifact_id: str | None = None,
) -> dict[str, Any]:
    if card_id == "courseware_ppt":
        return fallback_courseware_ppt_content(config, rag_snippets)
    if card_id == "word_document":
        return fallback_word_document_content(config, rag_snippets)
    if card_id == "interactive_quick_quiz":
        return fallback_quiz_content(config, rag_snippets)
    if card_id == "knowledge_mindmap":
        return fallback_mindmap_content(config, rag_snippets)
    if card_id == "interactive_games":
        return fallback_game_content(config, rag_snippets)
    if card_id == "classroom_qa_simulator":
        return fallback_simulator_content(config, rag_snippets)
    if card_id == "speaker_notes":
        return fallback_speaker_notes_content(
            config,
            rag_snippets,
            source_hint,
            source_artifact_id,
        )
    return fallback_animation_content(config, rag_snippets)
