from __future__ import annotations

from schemas.studio_cards import (
    ArtifactSurfaceType,
    CapabilityEngine,
    ExecutionCarrier,
    RefineMode,
    SelectionScope,
    SourceBindingMode,
)
from services.generation_session_service.card_catalog import CARD_CAPABILITIES
from services.generation_session_service.card_execution_plans import (
    CARD_EXECUTION_PLANS,
)
from services.generation_session_service.card_governance import CARD_GOVERNANCE

CARD_CAPABILITY_BY_ID = {card.id: card for card in CARD_CAPABILITIES}

CARD_DISPLAY_SEMANTICS = {
    "courseware_ppt": {
        "artifact_surface_type": ArtifactSurfaceType.DOCUMENT,
        "capability_engine": CapabilityEngine.RICH_TEXT,
        "execution_carrier": ExecutionCarrier.HYBRID,
        "supported_refine_modes": [RefineMode.CHAT_REFINE],
        "supported_selection_scopes": [SelectionScope.PAGE],
        "source_binding_mode": SourceBindingMode.SINGLE_ARTIFACT,
    },
    "word_document": {
        "artifact_surface_type": ArtifactSurfaceType.DOCUMENT,
        "capability_engine": CapabilityEngine.RICH_TEXT,
        "execution_carrier": ExecutionCarrier.HYBRID,
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.STRUCTURED_REFINE,
        ],
        "supported_selection_scopes": [SelectionScope.PARAGRAPH],
        "source_binding_mode": SourceBindingMode.SINGLE_ARTIFACT,
    },
    "interactive_quick_quiz": {
        "artifact_surface_type": ArtifactSurfaceType.FLASHCARD,
        "capability_engine": CapabilityEngine.SINGLE_ITEM,
        "execution_carrier": ExecutionCarrier.ARTIFACT,
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.STRUCTURED_REFINE,
        ],
        "supported_selection_scopes": [SelectionScope.QUESTION],
        "source_binding_mode": SourceBindingMode.NONE,
    },
    "interactive_games": {
        "artifact_surface_type": ArtifactSurfaceType.SANDBOX,
        "capability_engine": CapabilityEngine.SANDBOX_HTML,
        "execution_carrier": ExecutionCarrier.ARTIFACT,
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.STRUCTURED_REFINE,
        ],
        "supported_selection_scopes": [SelectionScope.NONE],
        "source_binding_mode": SourceBindingMode.SINGLE_ARTIFACT,
    },
    "knowledge_mindmap": {
        "artifact_surface_type": ArtifactSurfaceType.GRAPH,
        "capability_engine": CapabilityEngine.NODE_GRAPH,
        "execution_carrier": ExecutionCarrier.ARTIFACT,
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.STRUCTURED_REFINE,
        ],
        "supported_selection_scopes": [SelectionScope.NODE],
        "source_binding_mode": SourceBindingMode.NONE,
    },
    "demonstration_animations": {
        "artifact_surface_type": ArtifactSurfaceType.ANIMATION,
        "capability_engine": CapabilityEngine.MEDIA_TIMELINE,
        "execution_carrier": ExecutionCarrier.ARTIFACT,
        "render_contract": "storyboard_render_contract",
        "placement_supported": True,
        "runtime_preview_mode": "local_preview_only",
        "cloud_render_mode": "async_media_export",
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.STRUCTURED_REFINE,
        ],
        "supported_selection_scopes": [SelectionScope.SCENE],
        "source_binding_mode": SourceBindingMode.SINGLE_ARTIFACT,
    },
    "speaker_notes": {
        "artifact_surface_type": ArtifactSurfaceType.TELEPROMPTER,
        "capability_engine": CapabilityEngine.RICH_TEXT,
        "execution_carrier": ExecutionCarrier.HYBRID,
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.STRUCTURED_REFINE,
        ],
        "supported_selection_scopes": [SelectionScope.PAGE, SelectionScope.PARAGRAPH],
        "source_binding_mode": SourceBindingMode.SINGLE_ARTIFACT,
    },
    "classroom_qa_simulator": {
        "artifact_surface_type": ArtifactSurfaceType.SIMULATOR,
        "capability_engine": CapabilityEngine.SIMULATION_LOOP,
        "execution_carrier": ExecutionCarrier.HYBRID,
        "supported_refine_modes": [
            RefineMode.CHAT_REFINE,
            RefineMode.FOLLOW_UP_TURN,
        ],
        "supported_selection_scopes": [SelectionScope.NONE],
        "source_binding_mode": SourceBindingMode.NONE,
    },
}


def _enrich_with_display_semantics(card_id: str, payload: dict) -> dict:
    semantics = CARD_DISPLAY_SEMANTICS.get(card_id)
    governance = CARD_GOVERNANCE.get(card_id)
    enriched = payload
    if semantics:
        enriched = {
            **enriched,
            **{k: v.value if hasattr(v, "value") else v for k, v in semantics.items()},
        }
    if governance:
        enriched = {
            **enriched,
            **{
                k: (v.model_dump(mode="json") if hasattr(v, "model_dump") else v.value if hasattr(v, "value") else v)
                for k, v in governance.items()
            },
        }
    return enriched


def _normalize_semantic_lists(payload: dict) -> dict:
    for key in ("supported_refine_modes", "supported_selection_scopes"):
        values = payload.get(key)
        if isinstance(values, list):
            payload[key] = [value.value if hasattr(value, "value") else value for value in values]
    return payload


def get_studio_card_capabilities() -> list[dict]:
    return [
        _normalize_semantic_lists(
            _enrich_with_display_semantics(card.id, card.model_dump(mode="json"))
        )
        for card in CARD_CAPABILITIES
    ]


def get_studio_card_capability(card_id: str) -> dict | None:
    card = CARD_CAPABILITY_BY_ID.get(card_id)
    if card is None:
        return None
    return _normalize_semantic_lists(
        _enrich_with_display_semantics(card_id, card.model_dump(mode="json"))
    )


def get_studio_card_execution_plan(card_id: str) -> dict | None:
    plan = CARD_EXECUTION_PLANS.get(card_id)
    if plan is None:
        return None
    payload = plan.model_dump(mode="json")
    semantics = CARD_DISPLAY_SEMANTICS.get(card_id, {})
    for key in ("execution_carrier", "supported_refine_modes", "supported_selection_scopes"):
        if (key not in payload or payload.get(key) in (None, [])) and key in semantics:
            payload[key] = semantics[key]
    return _normalize_semantic_lists(payload)
