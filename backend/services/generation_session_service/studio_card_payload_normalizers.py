from __future__ import annotations

from typing import Any

from .interactive_games_legacy_adapter import normalize_interactive_game_payload
from .mindmap_normalizer import normalize_knowledge_mindmap_payload
from .tool_content_builder_payloads import normalize_speaker_notes_payload
from .word_document_normalizer import normalize_word_document_payload


def normalize_interactive_quick_quiz_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del config
    return dict(payload)


def normalize_generated_card_payload(
    *,
    card_id: str,
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if card_id == "word_document":
        return normalize_word_document_payload(payload, config)
    if card_id == "interactive_games":
        # Freeze-mode card: keep the compatibility adapter explicit instead of
        # letting template/runtime glue masquerade as formal product truth.
        return normalize_interactive_game_payload(payload, config)
    if card_id == "knowledge_mindmap":
        return normalize_knowledge_mindmap_payload(payload, config)
    if card_id == "interactive_quick_quiz":
        return normalize_interactive_quick_quiz_payload(payload, config)
    if card_id == "speaker_notes":
        return normalize_speaker_notes_payload(payload, config or {})
    return payload
