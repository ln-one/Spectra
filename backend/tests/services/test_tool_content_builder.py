from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from services.generation_session_service import (
    tool_content_builder,
    tool_content_builder_generation,
)
from utils.exceptions import APIException, ErrorCode


@pytest.mark.parametrize(
    ("card_id", "ai_content"),
    [
        ("courseware_ppt", '{"title":"Deck","summary":""}'),
        ("word_document", '{"title":"Doc","summary":""}'),
        ("knowledge_mindmap", '{"title":"Mindmap","nodes":[]}'),
        ("interactive_quick_quiz", '{"title":"Quiz","questions":[]}'),
        ("interactive_games", '{"title":"Game","html":""}'),
        ("speaker_notes", '{"title":"Notes","slides":[]}'),
    ],
)
@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_strict_validates_minimum_fields_for_all_cards(
    monkeypatch, card_id, ai_content
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": ai_content,
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id=card_id,
            project_id="p-001",
            config={"topic": "Forces"},
        )

    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.error_code == ErrorCode.INVALID_INPUT
    assert exc.details["card_id"] == card_id
    assert exc.details["phase"] == "validate"
    assert exc.details["failure_reason"].startswith("field_")


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_routes_animation_cards_to_runtime_pipeline(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    normalize_runtime_payload = AsyncMock(
        return_value={
            "kind": "animation_storyboard",
            "runtime_graph_version": "generic_explainer_graph.v1",
            "runtime_graph": {
                "family_hint": "algorithm_demo",
                "timeline": {"total_steps": 1},
                "steps": [
                    {
                        "primary_caption": {"title": "比较", "body": "看相邻元素"},
                        "entities": [{"id": "track-0", "kind": "track_stack"}],
                    }
                ],
                "used_primitives": ["AnimationGraphRenderer"],
            },
            "runtime_draft_version": "explainer_draft.v1",
            "runtime_draft": {"family_hint": "algorithm_demo"},
            "component_code": "export default function Animation() { return null; }",
            "runtime_source": "llm_draft_assembled_graph",
        }
    )
    monkeypatch.setattr(
        tool_content_builder,
        "normalize_demonstration_animation_payload",
        normalize_runtime_payload,
    )
    generate_structured = AsyncMock()
    monkeypatch.setattr(
        tool_content_builder,
        "generate_structured_artifact_content",
        generate_structured,
    )

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id="demonstration_animations",
        project_id="p-001",
        config={"topic": "冒泡排序", "motion_brief": "解释交换过程"},
    )

    assert payload["runtime_graph_version"] == "generic_explainer_graph.v1"
    normalize_runtime_payload.assert_awaited_once()
    generate_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_strict_rejects_non_json(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(return_value={"content": "not-json", "model": "openai/gpt-4o-mini"}),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id="knowledge_mindmap",
            project_id="p-001",
            config={"topic": "Newton laws"},
        )

    exc = exc_info.value
    assert exc.status_code == 502
    assert exc.error_code == ErrorCode.EXTERNAL_SERVICE_ERROR
    assert exc.details["card_id"] == "knowledge_mindmap"
    assert exc.details["phase"] == "parse"
    assert exc.details["failure_reason"] == "parse_json_failed"


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_strict_rejects_invalid_schema(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": '{"title":"Mindmap", "nodes":[]}',
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id="knowledge_mindmap",
            project_id="p-001",
            config={"topic": "Newton laws"},
        )

    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.error_code == ErrorCode.INVALID_INPUT
    assert exc.details["phase"] == "validate"
    assert "field_nodes_empty" in str(exc.details["failure_reason"])


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_allow_mode_uses_fallback(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "allow")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(side_effect=RuntimeError("provider down")),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id="knowledge_mindmap",
            project_id="p-001",
            config={"topic": "Newton laws"},
        )

    exc = exc_info.value
    assert exc.status_code == 502
    assert exc.error_code == ErrorCode.EXTERNAL_SERVICE_ERROR
    assert exc.details["phase"] == "generate"


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_allow_mode_rejects_non_json(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "allow")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(return_value={"content": "not-json", "model": "openai/gpt-4o-mini"}),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id="knowledge_mindmap",
            project_id="p-001",
            config={"topic": "Newton laws"},
        )

    exc = exc_info.value
    assert exc.status_code == 502
    assert exc.error_code == ErrorCode.EXTERNAL_SERVICE_ERROR
    assert exc.details["phase"] == "parse"


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_allow_mode_rejects_invalid_schema(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "allow")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": '{"title":"Mindmap", "nodes":[]}',
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id="knowledge_mindmap",
            project_id="p-001",
            config={"topic": "Newton laws"},
        )

    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.error_code == ErrorCode.INVALID_INPUT
    assert exc.details["phase"] == "validate"


@pytest.mark.asyncio
async def test_build_studio_simulator_turn_update_strict_requires_valid_payload(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": (
                    '{"turn_result":{"turn_anchor":"turn-1"},'
                    '"updated_content":{"title":"QA","turns":[]}}'
                ),
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_simulator_turn_update(
            current_content={"title": "QA", "turns": [{"id": 1}]},
            teacher_answer="Teacher answer",
            config={"topic": "forces"},
            project_id="p-001",
        )

    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.error_code == ErrorCode.INVALID_INPUT
    assert exc.details["phase"] == "validate_turn"


@pytest.mark.asyncio
async def test_build_studio_simulator_turn_update_allow_mode_fails_instead_of_fallback(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "allow")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["rag snippet"]),
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        AsyncMock(side_effect=RuntimeError("provider down")),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_simulator_turn_update(
            current_content={"title": "QA", "turns": [{"id": 1}]},
            teacher_answer="Teacher answer",
            config={"topic": "forces"},
            project_id="p-001",
        )

    exc = exc_info.value
    assert exc.status_code == 502
    assert exc.error_code == ErrorCode.EXTERNAL_SERVICE_ERROR
    assert exc.details["phase"] == "generate_turn"
