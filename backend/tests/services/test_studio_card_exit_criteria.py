from services.generation_session_service.card_capabilities import (
    get_studio_card_execution_plan,
)
from services.generation_session_service.tool_content_builder_routing import (
    resolve_card_artifact_builder,
)
from services.generation_session_service.tool_refine_builder.dispatcher import (
    build_structured_refine_artifact_content,
)


def test_only_animation_uses_dedicated_builder_routing_today():
    animation_builder = resolve_card_artifact_builder("demonstration_animations")
    word_builder = resolve_card_artifact_builder("word_document")
    quiz_builder = resolve_card_artifact_builder("interactive_quick_quiz")
    mindmap_builder = resolve_card_artifact_builder("knowledge_mindmap")
    speaker_notes_builder = resolve_card_artifact_builder("speaker_notes")
    simulator_builder = resolve_card_artifact_builder("classroom_qa_simulator")

    assert animation_builder is not word_builder
    assert word_builder is quiz_builder
    assert quiz_builder is mindmap_builder
    assert mindmap_builder is speaker_notes_builder
    assert speaker_notes_builder is simulator_builder


def test_active_cards_keep_one_formal_refine_or_turn_entry_contract():
    expected = {
        "word_document": {"refine": "ready", "turn": None, "placement": None},
        "interactive_quick_quiz": {
            "refine": "ready",
            "turn": None,
            "placement": None,
        },
        "knowledge_mindmap": {"refine": "ready", "turn": None, "placement": None},
        "speaker_notes": {"refine": "ready", "turn": None, "placement": None},
        "classroom_qa_simulator": {
            "refine": "partial",
            "turn": "ready",
            "placement": None,
        },
        "interactive_games": {"refine": "ready", "turn": None, "placement": None},
        "demonstration_animations": {
            "refine": "ready",
            "turn": None,
            "placement": "partial",
        },
    }

    for card_id, expected_status in expected.items():
        plan = get_studio_card_execution_plan(card_id)

        assert plan is not None
        assert plan["refine_binding"]["status"] == expected_status["refine"]

        if expected_status["turn"] is None:
            assert plan.get("follow_up_turn_binding") is None
        else:
            assert plan["follow_up_turn_binding"]["status"] == expected_status["turn"]

        if expected_status["placement"] is None:
            assert plan.get("placement_binding") is None
        else:
            assert plan["placement_binding"]["status"] == expected_status["placement"]


def test_structured_refine_dispatcher_supports_only_explicit_card_entries():
    supported_cards = {
        "word_document",
        "interactive_quick_quiz",
        "knowledge_mindmap",
        "interactive_games",
        "demonstration_animations",
        "speaker_notes",
    }

    consts = set(build_structured_refine_artifact_content.__code__.co_consts)

    for card_id in supported_cards:
        assert card_id in consts

    assert "classroom_qa_simulator" not in consts
