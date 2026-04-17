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
        ("demonstration_animations", '{"title":"Animation","html":""}'),
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
    assert exc.details["failure_reason"].startswith(("field_", "missing_field_"))


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
async def test_build_studio_tool_artifact_content_word_document_builds_structured_layout(
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
        tool_content_builder.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": (
                    '{"title":"进程管理学生讲义","summary":"面向学生的课堂讲义。",'
                    '"document_variant":"student_handout",'
                    '"layout_payload":{"learning_goals":["理解进程概念"],'
                    '"key_terms":[{"term":"进程","explanation":"程序的一次执行过程"}],'
                    '"core_concepts":[{"heading":"核心知识","bullets":["概念","特征"]}],'
                    '"worked_examples":[{"title":"例题一","steps":["审题","分析","作答"]}],'
                    '"practice_tasks":["完成课后练习"],'
                    '"summary_box":"抓住概念边界。",'
                    '"after_class_notes":["整理错题"]}}'
                ),
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id="word_document",
        project_id="p-001",
        config={"topic": "进程管理", "document_variant": "student_handout"},
    )

    assert payload is not None
    assert payload["kind"] == "word_document"
    assert payload["document_variant"] == "student_handout"
    assert payload["layout_version"] == "v1"
    assert payload["sections"]
    assert "<html" in payload["preview_html"]
    assert "<html" in payload["doc_source_html"]


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_interactive_games_template_mode(
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
        tool_content_builder.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": (
                    '{"game_title":"进程调度时间轴","instruction":"按先后排序",'
                    '"events":[{"id":"evt-1","label":"创建","year":"阶段1","hint":"开始"},'
                    '{"id":"evt-2","label":"调度","year":"阶段2","hint":"运行"}],'
                    '"correct_order":["evt-1","evt-2"],'
                    '"success_message":"正确","retry_message":"再试"}'
                ),
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id="interactive_games",
        project_id="p-001",
        config={"topic": "进程调度", "game_pattern": "timeline_sort"},
    )

    assert payload is not None
    assert payload["game_pattern"] == "timeline_sort"
    assert "game_data" in payload
    assert payload["game_data"]["game_title"] == "进程调度时间轴"
    assert "<html" in payload["html"]
    assert "const gameData =" in payload["html"]


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_interactive_games_template_validation_error(
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
        tool_content_builder.ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": '{"game_title":"坏数据","instruction":"",'
                '"pairs":[{"id":"p1","concept":"A","definition":"B"}],'
                '"success_message":"ok","retry_message":"retry"}',
                "model": "openai/gpt-4o-mini",
            }
        ),
    )

    with pytest.raises(APIException) as exc_info:
        await tool_content_builder.build_studio_tool_artifact_content(
            card_id="interactive_games",
            project_id="p-001",
            config={"topic": "进程调度", "game_pattern": "concept_match"},
        )

    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.error_code == ErrorCode.INVALID_INPUT
    assert exc.details["phase"] == "validate_game_data"


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
