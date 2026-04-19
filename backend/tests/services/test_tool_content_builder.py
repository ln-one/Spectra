from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from services.generation_session_service import (
    tool_content_builder,
    tool_content_builder_generation,
    tool_content_builder_routing,
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
            user_id="u-001",
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
    animation_builder = AsyncMock(
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
        "resolve_card_artifact_builder",
        lambda _card_id: animation_builder,
    )
    generate_structured = AsyncMock()
    monkeypatch.setattr(
        tool_content_builder_routing,
        "generate_structured_artifact_content",
        generate_structured,
    )

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id="demonstration_animations",
        project_id="p-001",
        user_id="u-001",
        config={"topic": "冒泡排序", "motion_brief": "解释交换过程"},
    )

    assert payload["runtime_graph_version"] == "generic_explainer_graph.v1"
    animation_builder.assert_awaited_once()
    generate_structured.assert_not_awaited()


def test_resolve_card_artifact_builder_uses_dedicated_animation_builder():
    assert (
        tool_content_builder_routing.resolve_card_artifact_builder(
            "demonstration_animations"
        )
        is tool_content_builder_routing.STUDIO_CARD_BUILDERS["demonstration_animations"]
    )
    assert (
        tool_content_builder_routing.resolve_card_artifact_builder("word_document")
        is not tool_content_builder_routing.STUDIO_CARD_BUILDERS["demonstration_animations"]
    )


def test_structured_generation_uses_larger_token_budget_for_speaker_notes():
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "speaker_notes"
        )
        > tool_content_builder_generation._resolve_card_generation_max_tokens(
            "knowledge_mindmap"
        )
    )
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "speaker_notes"
        )
        == 4800
    )


@pytest.mark.parametrize(
    ("card_id", "ai_content", "config", "expected_title"),
    [
        (
            "word_document",
            '{"title":"Doc","summary":"Summary","layout_payload":{"exam_meta":{"duration_minutes":20,"total_score":100,"instructions":["按要求作答"]},"sections":[{"section_title":"选择题","question_type":"single_choice","questions":[{"prompt":"进程的定义是什么？","score":10,"options":["A","B","C","D"],"answer":"A","analysis":"依据课堂定义判断。"}]}],"answer_sheet":["1. A"],"grading_notes":["概念准确","条理清晰"]}}',
            {"topic": "Forces", "document_variant": "post_class_quiz"},
            "Doc",
        ),
        (
            "interactive_games",
            '{"game_title":"排序挑战","instruction":"拖动排序","events":[{"id":"evt-1","label":"开始","year":"1910","hint":"提示"}],"correct_order":["evt-1"],"success_message":"完成","retry_message":"再试一次"}',
            {"topic": "Forces", "game_pattern": "timeline_sort"},
            "排序挑战",
        ),
    ],
)
@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_routes_cards_through_normalizers(
    monkeypatch, card_id, ai_content, config, expected_title
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

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id=card_id,
        project_id="p-001",
        user_id="u-001",
        config=config,
    )

    assert payload["title"] == expected_title
    if card_id == "word_document":
        assert payload["kind"] == "word_document"
        assert payload["document_content"]["type"] == "doc"
        assert "preview_html" in payload
        assert "doc_source_html" in payload
    else:
        assert payload["kind"] == "interactive_game"
        assert payload["game_pattern"] == "timeline_sort"
        assert "html" in payload
        assert payload["compatibility_zone"]["status"] == "protocol_limited"
        assert payload["runtime_origin"] == "legacy_compatibility"


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
            user_id="u-001",
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
            user_id="u-001",
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
            user_id="u-001",
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
            user_id="u-001",
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
            user_id="u-001",
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
