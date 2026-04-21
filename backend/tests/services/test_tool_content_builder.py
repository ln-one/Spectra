from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from services.generation_session_service import (
    tool_content_builder,
    tool_content_builder_generation,
    tool_content_builder_routing,
    tool_content_builder_support,
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
    expected_status = 422 if card_id == "word_document" else 400
    assert exc.status_code == expected_status
    assert exc.error_code == ErrorCode.INVALID_INPUT
    assert exc.details["card_id"] == card_id
    if card_id == "word_document":
        assert exc.details["phase"] == "quality_gate"
        assert str(exc.details["failure_reason"]).startswith("markdown_quality_low:")
    else:
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
    generate_structured = AsyncMock(
        return_value={
            "kind": "animation_storyboard",
            "title": "冒泡排序过程卡通演示动画",
            "summary": "解释交换过程",
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
    normalize_runtime_payload = AsyncMock(
        side_effect=lambda payload, _config: {
            **payload,
            "format": "html5",
            "render_mode": "html5",
        }
    )
    monkeypatch.setattr(
        tool_content_builder_routing,
        "generate_structured_artifact_content",
        generate_structured,
    )
    monkeypatch.setattr(
        tool_content_builder_routing,
        "normalize_demonstration_animation_payload",
        normalize_runtime_payload,
    )

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id="demonstration_animations",
        project_id="p-001",
        user_id="u-001",
        config={"topic": "冒泡排序", "motion_brief": "解释交换过程"},
    )

    assert payload["runtime_graph_version"] == "generic_explainer_graph.v1"
    assert payload["render_mode"] == "html5"
    generate_structured.assert_awaited_once()
    normalize_runtime_payload.assert_awaited_once()


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


def test_animation_schema_hint_includes_title_field():
    schema_hint = tool_content_builder_support.build_schema_hint(
        "demonstration_animations"
    )
    assert isinstance(schema_hint, str)
    assert '"title"' in schema_hint


def test_parse_ai_object_payload_recovers_json_object_from_prefixed_text():
    parsed = tool_content_builder_support.parse_ai_object_payload(
        card_id="knowledge_mindmap",
        ai_raw=(
            "模型附加说明：以下是结果。\n"
            '{"title":"动量守恒","nodes":[{"id":"root","parent_id":null,"title":"动量守恒","summary":"核心概念"}]}'
            "\n补充说明结束。"
        ),
        model="openai/gpt-4o-mini",
        phase="parse",
    )
    assert parsed["title"] == "动量守恒"
    assert isinstance(parsed.get("nodes"), list)


def test_validate_animation_payload_allows_descriptive_draft_without_runtime_arrays():
    tool_content_builder_support.validate_card_payload(
        "demonstration_animations",
        {
            "kind": "animation_storyboard",
            "topic": "冒泡排序",
            "summary": "讲解每一轮交换后的变化",
        },
    )


def test_structured_generation_uses_larger_token_budget_for_mindmap_than_speaker_notes():
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "knowledge_mindmap"
        )
        > tool_content_builder_generation._resolve_card_generation_max_tokens("speaker_notes")
    )
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "speaker_notes"
        )
        == 4800
    )
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "word_document"
        )
        == 5000
    )


def test_structured_generation_word_token_budget_can_be_overridden(monkeypatch):
    monkeypatch.setenv("WORD_LESSON_PLAN_MAX_TOKENS", "5600")
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "word_document"
        )
        == 5600
    )


def test_structured_generation_mindmap_timeout_can_be_overridden(monkeypatch):
    monkeypatch.delenv("MINDMAP_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", raising=False)

    assert tool_content_builder_generation._resolve_mindmap_timeout_seconds() is None
    assert (
        tool_content_builder_generation._resolve_mindmap_review_timeout_seconds()
        is None
    )

    monkeypatch.setenv("MINDMAP_TIMEOUT_SECONDS", "240")
    assert tool_content_builder_generation._resolve_mindmap_timeout_seconds() == 240
    assert (
        tool_content_builder_generation._resolve_mindmap_review_timeout_seconds()
        == 240
    )

    monkeypatch.setenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", "360")
    assert (
        tool_content_builder_generation._resolve_mindmap_review_timeout_seconds()
        == 360
    )


def test_structured_generation_mindmap_token_budget_can_be_overridden(monkeypatch):
    monkeypatch.setenv("MINDMAP_MAX_TOKENS", "6400")
    assert (
        tool_content_builder_generation._resolve_card_generation_max_tokens(
            "knowledge_mindmap"
        )
        == 6400
    )


def test_word_rag_snippet_sanitization_removes_symbol_noise():
    cleaned = tool_content_builder._sanitize_rag_text(
        "###@@@@\n\n物理层负责比特传输！！！？？？？\n||||||||\n"
    )
    assert "||||" not in cleaned
    assert "物理层负责比特传输" in cleaned


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
        assert payload["kind"] == "teaching_document"
        assert payload["legacy_kind"] == "word_document"
        assert payload["schema_id"] == "lesson_plan_v1"
        assert payload["document_content"]["type"] == "doc"
        assert isinstance(payload["lesson_plan"], dict)
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
async def test_build_studio_tool_artifact_content_word_uses_markdown_first_generation(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    generate_mock = AsyncMock(
        return_value={
            "content": (
                "# 计算机网络：物理层教案\n\n"
                "聚焦物理层关键概念与课堂任务，强调信号传输、介质选择与课堂任务闭环。\n\n"
                "## 教学定位\n\n"
                "教学情境：以通信案例引导物理层学习。\n"
                "学情画像：学生了解分层，但缺少底层传输直觉。\n\n"
                "## 分层目标\n\n"
                "A层目标：复述物理层职责。\n"
                "B层目标：解释介质差异与编码关系。\n"
                "C层目标：在场景中选择合适传输介质。\n\n"
                "## 教学流程\n\n"
                "### 情境导入（10分钟）\n"
                "教师活动：讲解案例并提出问题。\n"
                "学生活动：讨论问题并记录要点。\n"
                "产出：形成待解决问题清单。\n\n"
                "### 概念建构（20分钟）\n"
                "教师活动：讲解核心概念与示例。\n"
                "学生活动：完成对比分析。\n"
                "产出：完成概念表。\n\n"
                "### 迁移应用（15分钟）\n"
                "教师活动：组织任务演练。\n"
                "学生活动：完成小组任务并展示。\n"
                "产出：提交方案说明。\n\n"
                "## 评价与拓展\n\n"
                "关键问题：物理层如何屏蔽介质差异？\n"
                "差异化支持：基础层给出模板，进阶层给开放题。\n"
                "评价方式：课堂提问与任务表现结合。\n\n"
                "## 作业\n\n"
                "- 作业建议：完成介质选择分析短文。\n"
                "- 课后延伸：比较双绞线与光纤的应用场景。\n"
                "1. 画出家庭网络中的物理层介质分布。\n"
                "2. 给出一种校园场景下的介质选型理由。\n"
            ),
            "model": "dashscope/qwen3.5-flash-2026-02-23",
            "tokens_used": 1200,
        }
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        generate_mock,
    )

    await tool_content_builder.build_studio_tool_artifact_content(
        card_id="word_document",
        project_id="p-001",
        user_id="u-001",
        config={"topic": "计算机网络 物理层教案"},
    )

    assert generate_mock.await_count == 2
    first_call = generate_mock.await_args_list[0].kwargs
    review_call = generate_mock.await_args_list[1].kwargs
    assert first_call["response_format"] is None
    assert first_call["max_tokens"] == 5000
    assert review_call["response_format"] is None
    assert review_call["max_tokens"] == 3200


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
async def test_build_studio_tool_artifact_content_reviews_mindmap_and_uses_large_budget(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setenv("MINDMAP_REVIEW_ENABLED", "true")
    monkeypatch.setattr(
        tool_content_builder,
        "_load_rag_snippets",
        AsyncMock(return_value=["[来源:doc.pdf] 停止等待协议的效率受发送时间和往返等待时间共同影响。"]),
    )
    monkeypatch.setattr(
        tool_content_builder,
        "_load_source_artifact_hint",
        AsyncMock(return_value=None),
    )
    generate_mock = AsyncMock(
        side_effect=[
            {
                "content": (
                    '{"title":"停止等待协议","nodes":['
                    '{"id":"root","parent_id":null,"title":"停止等待协议"},'
                    '{"id":"a","parent_id":"root","title":"定义"},'
                    '{"id":"a1","parent_id":"a","title":"发送确认"},'
                    '{"id":"a2","parent_id":"a","title":"逐帧等待"},'
                    '{"id":"b","parent_id":"root","title":"效率问题 chunk 01","summary":"见第3页"},'
                    '{"id":"b1","parent_id":"b","title":"传播时延"},'
                    '{"id":"b2","parent_id":"b","title":"确认等待"},'
                    '{"id":"c","parent_id":"root","title":"影响因素"},'
                    '{"id":"c1","parent_id":"c","title":"RTT"},'
                    '{"id":"c2","parent_id":"c","title":"帧长"},'
                    '{"id":"d","parent_id":"root","title":"误区"},'
                    '{"id":"d1","parent_id":"d","title":"只看带宽"},'
                    '{"id":"d2","parent_id":"d","title":"忽略等待"},'
                    '{"id":"e","parent_id":"root","title":"优化"},'
                    '{"id":"e1","parent_id":"e","title":"滑动窗口"},'
                    '{"id":"e2","parent_id":"e","title":"批量确认"},'
                    '{"id":"e1a","parent_id":"e1","title":"并行发送"},'
                    '{"id":"e1b","parent_id":"e1","title":"提高利用率"}]}'
                ),
                "model": "openai/gpt-5.4",
            },
            {
                "content": (
                    '{"title":"停止等待协议","summary":"围绕效率与优化思路组织的知识导图","nodes":['
                    '{"id":"root","parent_id":null,"title":"停止等待协议"},'
                    '{"id":"a","parent_id":"root","title":"基本机制"},'
                    '{"id":"a1","parent_id":"a","title":"发送确认"},'
                    '{"id":"a2","parent_id":"a","title":"逐帧等待"},'
                    '{"id":"b","parent_id":"root","title":"效率瓶颈"},'
                    '{"id":"b1","parent_id":"b","title":"传播时延"},'
                    '{"id":"b2","parent_id":"b","title":"确认等待"},'
                    '{"id":"c","parent_id":"root","title":"关键变量"},'
                    '{"id":"c1","parent_id":"c","title":"RTT"},'
                    '{"id":"c2","parent_id":"c","title":"帧长"},'
                    '{"id":"d","parent_id":"root","title":"常见误区"},'
                    '{"id":"d1","parent_id":"d","title":"只看带宽"},'
                    '{"id":"d2","parent_id":"d","title":"忽略等待"},'
                    '{"id":"e","parent_id":"root","title":"优化方向"},'
                    '{"id":"e1","parent_id":"e","title":"滑动窗口"},'
                    '{"id":"e2","parent_id":"e","title":"批量确认"},'
                    '{"id":"e1a","parent_id":"e1","title":"并行发送"},'
                    '{"id":"e1b","parent_id":"e1","title":"提高利用率"}]}'
                ),
                "model": "openai/gpt-5.4",
            },
        ]
    )
    monkeypatch.setattr(
        tool_content_builder_generation.ai_service,
        "generate",
        generate_mock,
    )

    payload = await tool_content_builder.build_studio_tool_artifact_content(
        card_id="knowledge_mindmap",
        project_id="p-001",
        user_id="u-001",
        config={"topic": "停止等待协议", "depth": 5},
    )

    assert payload["title"] == "停止等待协议"
    assert generate_mock.await_count == 2
    first_call = generate_mock.await_args_list[0].kwargs
    review_call = generate_mock.await_args_list[1].kwargs
    assert first_call["response_format"] == {"type": "json_object"}
    assert first_call["max_tokens"] == 5200
    assert review_call["response_format"] == {"type": "json_object"}
    assert review_call["max_tokens"] == 5200


@pytest.mark.asyncio
async def test_build_studio_tool_artifact_content_rejects_low_quality_mindmap(
    monkeypatch,
):
    monkeypatch.setenv("STUDIO_TOOL_FALLBACK_MODE", "strict")
    monkeypatch.setenv("STUDIO_TOOL_ENABLE_AI_GENERATION", "true")
    monkeypatch.setenv("MINDMAP_REVIEW_ENABLED", "false")
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
                "content": (
                    '{"title":"Mindmap","nodes":['
                    '{"id":"root","parent_id":null,"title":"Mindmap"},'
                    '{"id":"a","parent_id":"root","title":"资料里提到的定义","summary":"见第2页 chunk 01"},'
                    '{"id":"b","parent_id":"a","title":"展开说明"}]}'
                ),
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
    assert exc.status_code == 422
    assert exc.details["phase"] == "quality_gate"
    assert str(exc.details["failure_reason"]).startswith("mindmap_quality_low:")


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
