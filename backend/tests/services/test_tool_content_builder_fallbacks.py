from services.generation_session_service.tool_content_builder_fallbacks import (
    SUPPORTED_CARD_IDS,
    fallback_content,
)


def test_supported_card_ids_cover_courseware_and_word_cards() -> None:
    assert "courseware_ppt" in SUPPORTED_CARD_IDS
    assert "word_document" in SUPPORTED_CARD_IDS
    assert len(SUPPORTED_CARD_IDS) >= 8


def test_fallback_content_supports_courseware_ppt() -> None:
    payload = fallback_content(
        card_id="courseware_ppt",
        config={"topic": "网络分层", "pages": 10, "template": "gaia"},
        rag_snippets=["参考片段"],
    )

    assert payload["kind"] == "courseware_ppt"
    assert payload["pages"] == 10
    assert payload["template"] == "gaia"


def test_fallback_content_supports_word_document() -> None:
    payload = fallback_content(
        card_id="word_document",
        config={"topic": "网络分层", "document_variant": "student_handout"},
        rag_snippets=["参考片段"],
    )

    assert payload["kind"] == "word_document"
    assert payload["document_variant"] == "student_handout"
    assert isinstance(payload["sections"], list)
    assert payload["sections"]
    assert isinstance(payload["lesson_plan_markdown"], str)
    assert payload["lesson_plan_markdown"].startswith("# ")


def test_fallback_content_supports_interactive_games_template_patterns() -> None:
    payload = fallback_content(
        card_id="interactive_games",
        config={"topic": "进程管理", "game_pattern": "quiz_challenge"},
        rag_snippets=["进程状态转换与调度策略"],
    )

    assert payload["kind"] == "interactive_game"
    assert payload["game_pattern"] == "quiz_challenge"
    assert isinstance(payload["game_data"], dict)
    assert payload["game_data"]["game_title"]
    assert "<html" in payload["html"]
