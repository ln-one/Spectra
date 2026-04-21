from __future__ import annotations


def build_chat_refine_metadata(card_id: str, body: dict, payload: dict) -> dict | None:
    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        return metadata
    config = body.get("config") or {}
    if card_id == "speaker_notes":
        return {
            "card_id": card_id,
            "source_artifact_id": body.get("source_artifact_id")
            or config.get("source_artifact_id"),
            "selected_script_segment": config.get("selected_script_segment"),
            "active_page": config.get("active_page"),
            "highlight_transition": config.get("highlight_transition"),
        }
    if card_id == "interactive_games":
        return {
            "card_id": card_id,
            "game_pattern": config.get("mode", config.get("game_pattern", "freeform")),
            "sandbox_patch": config.get("sandbox_patch"),
        }
    if card_id == "knowledge_mindmap":
        return {
            "card_id": card_id,
            "selected_node_path": config.get("selected_node_path")
            or config.get("selected_id"),
        }
    if card_id == "interactive_quick_quiz":
        selection_anchor = config.get("selection_anchor") or {}
        return {
            "card_id": card_id,
            "current_question_id": selection_anchor.get("anchor_id")
            or config.get("question_id")
            or config.get("current_question_id"),
            "selection_anchor": selection_anchor if isinstance(selection_anchor, dict) else None,
        }
    return {"card_id": card_id}
