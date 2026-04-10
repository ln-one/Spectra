from services.generation_session_service.tool_content_builder_fallbacks import (
    SUPPORTED_CARD_IDS,
    card_query_text,
)


def test_supported_card_ids_cover_courseware_and_word_cards() -> None:
    assert "courseware_ppt" in SUPPORTED_CARD_IDS
    assert "word_document" in SUPPORTED_CARD_IDS
    assert len(SUPPORTED_CARD_IDS) >= 8


def test_card_query_text_prefers_topic_and_document_variant() -> None:
    assert (
        card_query_text(
            "word_document",
            {"topic": "网络分层", "document_variant": "student_handout"},
        )
        == "网络分层"
    )
    assert (
        card_query_text("word_document", {"document_variant": "student_handout"})
        == "student_handout"
    )


def test_card_query_text_supports_simulator_focus() -> None:
    assert (
        card_query_text("classroom_qa_simulator", {"question_focus": "边界条件"})
        == "边界条件"
    )
