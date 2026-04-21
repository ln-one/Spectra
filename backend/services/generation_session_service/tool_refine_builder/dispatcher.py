"""Structured refine dispatcher."""

from __future__ import annotations

from typing import Any

from .animation import refine_animation_content
from .interactive_game import refine_interactive_game_content
from .mindmap import refine_mindmap_content
from .quiz import refine_quiz_content
from .speaker_notes import refine_speaker_notes_content
from .word_document import refine_word_document_content


async def build_structured_refine_artifact_content(
    *,
    card_id: str,
    current_content: dict[str, Any],
    message: str,
    config: dict[str, Any] | None,
    project_id: str,
    rag_source_ids: list[str] | None = None,
) -> dict[str, Any]:
    cfg = dict(config or {})
    if card_id == "knowledge_mindmap":
        return await refine_mindmap_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "word_document":
        return await refine_word_document_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "interactive_quick_quiz":
        return await refine_quiz_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "interactive_games":
        return await refine_interactive_game_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "demonstration_animations":
        return await refine_animation_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    if card_id == "speaker_notes":
        return await refine_speaker_notes_content(
            current_content=current_content,
            message=message,
            config=cfg,
            project_id=project_id,
            rag_source_ids=rag_source_ids,
        )
    raise ValueError(f"Unsupported structured refine card: {card_id}")
