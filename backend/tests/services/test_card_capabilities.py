from services.generation_session_service.card_capabilities import (
    get_studio_card_capability,
    get_studio_card_capabilities,
    get_studio_card_execution_plan,
)


def test_card_capabilities_include_governance_metadata():
    word_card = get_studio_card_capability("word_document")

    assert word_card is not None
    assert word_card["governance_tag"] == "borrow"
    assert word_card["cleanup_priority"] == "p1"
    assert word_card["surface_strategy"] == "document_surface_adapter"
    assert word_card["frozen"] is False
    assert word_card["health_report"]["replaceability"] == 5


def test_active_cards_expose_conservative_governance_snapshots():
    word_card = get_studio_card_capability("word_document")
    quiz_card = get_studio_card_capability("interactive_quick_quiz")
    mindmap_card = get_studio_card_capability("knowledge_mindmap")

    assert word_card is not None
    assert word_card["requires_source_artifact"] is False
    assert word_card["supports_chat_refine"] is True
    assert word_card["governance_tag"] == "borrow"

    assert quiz_card is not None
    assert quiz_card["requires_source_artifact"] is False
    assert quiz_card["governance_tag"] == "defer"
    assert "chat_refine" in quiz_card["supported_refine_modes"]

    assert mindmap_card is not None
    assert mindmap_card["governance_tag"] == "borrow"
    assert "structured_refine" in mindmap_card["supported_refine_modes"]
    assert "node" in mindmap_card["supported_selection_scopes"]


def test_interactive_games_is_marked_as_frozen_cleanup_target():
    cards = {card["id"]: card for card in get_studio_card_capabilities()}

    assert cards["interactive_games"]["governance_tag"] == "freeze"
    assert cards["interactive_games"]["cleanup_priority"] == "p0"
    assert cards["interactive_games"]["frozen"] is True
    assert cards["interactive_games"]["health_report"]["fallback_residue"] == 1
    assert cards["interactive_games"]["supports_chat_refine"] is False

    plan = get_studio_card_execution_plan("interactive_games")
    assert plan is not None
    assert plan["initial_binding"]["status"] == "partial"
    assert plan["refine_binding"]["status"] == "partial"
    assert "legacy compatibility" in plan["initial_binding"]["notes"]


def test_harden_cards_keep_surface_and_binding_contracts():
    speaker_notes = get_studio_card_capability("speaker_notes")
    simulator = get_studio_card_capability("classroom_qa_simulator")
    simulator_plan = get_studio_card_execution_plan("classroom_qa_simulator")

    assert speaker_notes is not None
    assert speaker_notes["governance_tag"] == "harden"
    assert speaker_notes["cleanup_priority"] == "p2"
    assert speaker_notes["surface_strategy"] == "anchored_document_surface"

    assert simulator is not None
    assert simulator["governance_tag"] == "harden"
    assert simulator["cleanup_priority"] == "p2"
    assert simulator["surface_strategy"] == "turn_based_simulation_shell"
    assert simulator["supports_chat_refine"] is True

    assert simulator_plan is not None
    assert simulator_plan["initial_binding"]["status"] == "ready"
    assert simulator_plan["refine_binding"]["status"] == "partial"
    assert simulator_plan["follow_up_turn_binding"]["status"] == "ready"


def test_classroom_simulator_execution_plan_exposes_follow_up_turn_binding():
    plan = get_studio_card_execution_plan("classroom_qa_simulator")

    assert plan is not None
    assert plan["follow_up_turn_binding"]["endpoint"].endswith(
        "/studio-cards/classroom_qa_simulator/turn"
    )
    assert plan["follow_up_turn_binding"]["status"] == "ready"
    assert plan["source_binding"] is None


def test_demonstration_animations_exposes_contract_first_execution_metadata():
    card = get_studio_card_capability("demonstration_animations")
    plan = get_studio_card_execution_plan("demonstration_animations")

    assert card is not None
    assert card["governance_tag"] == "separate-track"
    assert card["cleanup_priority"] == "p1"
    assert card["surface_strategy"] == "separate_runtime_track"
    assert card["render_contract"] == "storyboard_render_contract"
    assert card["placement_supported"] is True
    assert card["runtime_preview_mode"] == "local_preview_only"
    assert card["cloud_render_mode"] == "async_media_export"
    animation_format_field = next(
        field for field in card["config_fields"] if field["key"] == "animation_format"
    )
    assert animation_format_field["default_value"] == "html5"

    assert plan is not None
    assert plan["refine_binding"]["endpoint"].endswith(
        "/studio-cards/{card_id}/refine"
    )
    assert plan["refine_binding"]["status"] == "ready"
    assert plan["refine_binding"]["transport"] == "artifact_create"
    assert plan["source_binding"]["endpoint"].endswith(
        "/studio-cards/{card_id}/sources"
    )
    assert plan["placement_binding"]["endpoint"].endswith(
        "/studio-cards/{card_id}/confirm-placement"
    )
