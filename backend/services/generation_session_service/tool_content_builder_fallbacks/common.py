"""Shared fallback dispatch helpers."""

from __future__ import annotations

from typing import Any

SUPPORTED_CARD_IDS = {
    "courseware_ppt",
    "word_document",
    "knowledge_mindmap",
    "interactive_quick_quiz",
    "interactive_games",
    "classroom_qa_simulator",
    "demonstration_animations",
    "speaker_notes",
}


def card_query_text(card_id: str, config: dict[str, Any]) -> str:
    if card_id == "courseware_ppt":
        return str(
            config.get("topic") or config.get("system_prompt_tone") or "教学课件生成"
        )
    if card_id == "word_document":
        return str(config.get("topic") or config.get("document_variant") or "教学文档")
    if card_id == "knowledge_mindmap":
        return str(config.get("topic") or config.get("focus_scope") or "课程知识结构")
    if card_id == "interactive_quick_quiz":
        return str(config.get("scope") or config.get("question_focus") or "随堂测验")
    if card_id == "interactive_games":
        return str(config.get("topic") or config.get("creative_brief") or "互动游戏")
    if card_id == "classroom_qa_simulator":
        return str(
            config.get("topic") or config.get("question_focus") or "课堂问答预演"
        )
    if card_id == "demonstration_animations":
        return str(config.get("topic") or config.get("motion_brief") or "演示动画")
    if card_id == "speaker_notes":
        return str(config.get("topic") or "逐页说课讲稿")
    return "教学工具生成"
