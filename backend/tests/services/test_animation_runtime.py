import pytest

from services.artifact_generator import animation_runtime_llm
from services.artifact_generator.animation_runtime import (
    RUNTIME_CONTRACT,
    RUNTIME_SOURCE,
    RUNTIME_VERSION,
    enrich_animation_runtime_snapshot_async,
)
from services.artifact_generator.animation_runtime_codegen import (
    RUNTIME_DRAFT_VERSION,
    RUNTIME_GRAPH_VERSION,
    build_explainer_draft_seed,
)
from services.artifact_generator.animation_runtime_graph_assembly import (
    normalize_action_hints,
    normalized_steps,
    validate_explainer_draft,
)
from services.generation_session_service.tool_content_builder_payloads import (
    normalize_demonstration_animation_payload,
)
from utils.exceptions import APIException


def _algorithm_content() -> dict:
    return {
        "title": "冒泡排序演示动画",
        "summary": "通过动画理解比较与交换。",
        "animation_family": "algorithm_demo",
        "dataset": [5, 3, 8, 2, 6],
        "steps": [
            {
                "action": "compare",
                "active_indices": [0, 1],
                "caption": "先比较第一对元素。",
                "snapshot": [5, 3, 8, 2, 6],
            },
            {
                "action": "swap",
                "active_indices": [0, 1],
                "swap_indices": [0, 1],
                "caption": "5 大于 3，交换。",
                "snapshot": [3, 5, 8, 2, 6],
            },
        ],
        "scenes": [
            {
                "title": "先看数据初始状态",
                "description": "展示初始排列",
                "emphasis": "说明初始状态",
            }
        ],
    }


def _generic_content(family_hint: str) -> dict:
    return {
        "title": f"{family_hint} 演示动画",
        "summary": "解释型动画。",
        "animation_family": family_hint,
        "steps": [
            {"title": "开始", "caption": "先看核心对象。"},
            {"title": "变化", "caption": "观察主要变化。"},
        ],
        "scenes": [{"title": "概览", "description": "第一视角"}],
    }


def _valid_draft(content: dict, family_hint: str) -> dict:
    return build_explainer_draft_seed(content, family_hint)


@pytest.mark.asyncio
async def test_normalize_demonstration_animation_payload_adds_runtime_graph_fields(monkeypatch):
    async def _fake_runtime(*args, **kwargs):
        content = args[0]
        family_hint = kwargs["family_hint"]
        return _valid_draft(content, family_hint), {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
            "schema_mode": "json_schema",
        }

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.generate_animation_runtime_plan_with_llm",
        _fake_runtime,
    )

    payload = await normalize_demonstration_animation_payload(_algorithm_content(), {})

    assert payload["runtime_version"] == RUNTIME_VERSION
    assert payload["runtime_contract"] == RUNTIME_CONTRACT
    assert payload["runtime_source"] == RUNTIME_SOURCE
    assert payload["runtime_graph_version"] == RUNTIME_GRAPH_VERSION
    assert payload["runtime_draft_version"] == RUNTIME_DRAFT_VERSION
    assert payload["runtime_provider"] == "dashscope"
    assert payload["compile_status"] == "pending"
    assert payload["style_pack"] == "teaching_ppt_minimal_gray"
    assert payload["placement_supported"] is False
    assert payload["runtime_preview_mode"] == "local_preview_only"
    assert payload["runtime_graph"]["family_hint"] == "algorithm_demo"
    assert payload["runtime_graph"]["used_primitives"] == ["AnimationGraphRenderer"]
    assert "AnimationGraphRenderer" in payload["component_code"]


@pytest.mark.asyncio
async def test_normalize_demonstration_animation_payload_marks_gif_placement_supported(
    monkeypatch,
):
    async def _fake_runtime(*args, **kwargs):
        content = args[0]
        family_hint = kwargs["family_hint"]
        return _valid_draft(content, family_hint), {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
            "schema_mode": "json_schema",
        }

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.generate_animation_runtime_plan_with_llm",
        _fake_runtime,
    )

    payload = await normalize_demonstration_animation_payload(
        _algorithm_content(),
        {"animation_format": "gif"},
    )

    assert payload["animation_format"] == "gif"
    assert payload["render_mode"] == "gif"
    assert payload["placement_supported"] is True


@pytest.mark.asyncio
async def test_runtime_generation_marks_provider_errors_explicitly(monkeypatch):
    async def _boom(*args, **kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.generate_animation_runtime_plan_with_llm",
        _boom,
    )

    snapshot = await enrich_animation_runtime_snapshot_async(_algorithm_content())

    assert snapshot["compile_status"] == "error"
    assert snapshot["compile_errors"][0]["source"] == "provider"
    assert snapshot["compile_errors"][0]["rule_id"] == "provider_timeout"


@pytest.mark.asyncio
async def test_runtime_generation_rejects_invalid_structured_draft(monkeypatch):
    async def _invalid_draft(*args, **kwargs):
        return {
            "story_beats": [],
            "entities_outline": [],
            "step_captions": [],
            "action_hints": [],
            "layout_intent": "",
            "focus_targets": [],
            "family_hint": "algorithm_demo",
            "style_tone": "",
            "extra_field": "should fail",
        }, {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
        }

    async def _repair(*args, **kwargs):
        return {}, {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
        }

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.generate_animation_runtime_plan_with_llm",
        _invalid_draft,
    )
    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.repair_animation_runtime_plan_with_llm",
        _repair,
    )

    snapshot = await enrich_animation_runtime_snapshot_async(_algorithm_content())

    assert snapshot["compile_status"] == "error"
    assert any(
        item["rule_id"] == "runtime-draft-schema-error"
        for item in snapshot["runtime_validation_report"]
    )
    assert snapshot["compile_errors"][-1]["rule_id"] == "runtime_repair_exhausted"


@pytest.mark.asyncio
async def test_runtime_repair_loop_recovers_invalid_draft(monkeypatch):
    calls = {"count": 0}

    async def _invalid_draft(*args, **kwargs):
        content = args[0]
        family_hint = kwargs["family_hint"]
        draft = _valid_draft(content, family_hint)
        draft["step_captions"] = draft["step_captions"][:1]
        return draft, {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
            "schema_mode": "json_schema",
        }

    async def _repair(*args, **kwargs):
        calls["count"] += 1
        content = args[0]
        family_hint = kwargs["family_hint"]
        return _valid_draft(content, family_hint), {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
            "schema_mode": "json_schema",
        }

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.generate_animation_runtime_plan_with_llm",
        _invalid_draft,
    )
    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.repair_animation_runtime_plan_with_llm",
        _repair,
    )

    snapshot = await enrich_animation_runtime_snapshot_async(_algorithm_content())

    assert snapshot["compile_status"] == "pending"
    assert snapshot["runtime_attempt_count"] == 2
    assert calls["count"] == 1
    assert snapshot["runtime_graph"]["family_hint"] == "algorithm_demo"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "family_hint",
    ["physics_mechanics", "system_flow", "math_transform"],
)
async def test_runtime_graph_supports_multiple_explainer_families(monkeypatch, family_hint):
    async def _fake_runtime(*args, **kwargs):
        content = args[0]
        return _valid_draft(content, family_hint), {
            "runtime_provider": "dashscope",
            "runtime_model": "dashscope/qwen3.6-flash",
            "schema_mode": "json_schema",
        }

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.generate_animation_runtime_plan_with_llm",
        _fake_runtime,
    )

    snapshot = await enrich_animation_runtime_snapshot_async(_generic_content(family_hint))

    assert snapshot["compile_status"] == "pending"
    assert snapshot["runtime_graph"]["family_hint"] == family_hint
    assert snapshot["runtime_graph"]["steps"]
    assert "AnimationGraphRenderer" in snapshot["component_code"]


def test_normalize_action_hints_maps_common_llm_aliases():
    assert normalize_action_hints(["establish", "reveal_layout", "advance", "merge", "recap"]) == [
        "reveal",
        "move",
        "connect",
        "highlight",
    ]


def test_normalize_action_hints_maps_algorithm_drift_tokens():
    assert normalize_action_hints(
        ["skip", "lock", "settle.", "trace_path", "visit", "scan"]
    ) == [
        "compare",
        "complete",
        "focus",
    ]


def test_validate_explainer_draft_rejects_unknown_action_hints():
    content = _generic_content("physics_mechanics")
    draft = _valid_draft(content, "physics_mechanics")
    draft["action_hints"][0] = ["levitate"]

    errors = validate_explainer_draft(draft, content, "physics_mechanics")

    assert any(item["rule_id"] == "draft-action-hints-invalid" for item in errors)


def test_normalized_steps_reads_runtime_graph_track_stack_data():
    content = {
        "runtime_graph": {
            "steps": [
                {
                    "primary_caption": {"title": "交换", "body": "5 > 3，交换"},
                    "entities": [
                        {
                            "kind": "track_stack",
                            "data": [5, 3, 8, 4],
                            "highlight": [0, 1],
                        }
                    ],
                }
            ]
        }
    }

    steps = normalized_steps(content)

    assert len(steps) == 1
    assert steps[0]["snapshot"] == [5.0, 3.0, 8.0, 4.0]
    assert steps[0]["swap_indices"] == [0, 1]
    assert steps[0]["action"] == "swap"


def test_normalized_steps_reads_runtime_graph_track_stack_items():
    content = {
        "runtime_graph": {
            "steps": [
                {
                    "primary_caption": {"title": "比较", "body": "先比较前两项"},
                    "entities": [
                        {
                            "kind": "track_stack",
                            "items": [
                                {"value": 7, "accent": "active"},
                                {"value": 2, "accent": "active"},
                                {"value": 5, "accent": "muted"},
                            ],
                        }
                    ],
                }
            ]
        }
    }

    steps = normalized_steps(content)

    assert len(steps) == 1
    assert steps[0]["snapshot"] == [7.0, 2.0, 5.0]
    assert steps[0]["active_indices"] == [0, 1]
    assert steps[0]["action"] == "compare"


def test_normalized_steps_prefers_runtime_graph_when_algorithm_raw_steps_have_no_snapshot():
    content = {
        "animation_family": "algorithm_demo",
        "steps": [
            {"title": "引入主题", "caption": "泛化步骤，无数组状态"},
            {"title": "展开过程", "caption": "泛化步骤，无数组状态"},
        ],
        "runtime_graph": {
            "steps": [
                {
                    "primary_caption": {"title": "交换", "body": "5 > 3"},
                    "entities": [
                        {
                            "kind": "track_stack",
                            "data": [5, 3, 8, 4],
                            "highlight": [0, 1],
                        }
                    ],
                }
            ]
        },
    }

    steps = normalized_steps(content)

    assert len(steps) == 1
    assert steps[0]["snapshot"] == [5.0, 3.0, 8.0, 4.0]
    assert steps[0]["swap_indices"] == [0, 1]


def test_normalized_steps_seeds_algorithm_snapshots_when_missing():
    content = {
        "animation_family": "algorithm_demo",
        "algorithm_type": "bubble_sort",
        "dataset": [5, 3, 8, 2],
        "steps": [
            {"title": "步骤一", "caption": "先看数组"},
            {"title": "步骤二", "caption": "比较并交换"},
            {"title": "步骤三", "caption": "继续推进"},
        ],
    }

    steps = normalized_steps(content)

    assert len(steps) == 3
    assert steps[0]["snapshot"] == [5.0, 3.0, 8.0, 2.0]
    assert steps[1]["snapshot"] == [3.0, 5.0, 8.0, 2.0]
    assert steps[1]["swap_indices"] == [0, 1]
    assert all(isinstance(step.get("snapshot"), list) and step["snapshot"] for step in steps)


@pytest.mark.asyncio
async def test_runtime_llm_resolves_qwen_models_before_call(monkeypatch):
    captured: dict[str, str] = {}

    async def _fake_completion(**kwargs):
        captured["model"] = kwargs["model"]
        captured["response_format_type"] = kwargs["response_format"]["type"]
        captured["strict"] = kwargs["response_format"]["json_schema"]["strict"]
        captured["result_format"] = kwargs["extra_body"]["result_format"]
        captured["enable_thinking"] = kwargs["extra_body"]["enable_thinking"]

        class _Message:
            content = json_payload
            reasoning_content = "hidden"

        class _Choice:
            message = _Message()
            finish_reason = "stop"

        class _Response:
            choices = [_Choice()]

        return _Response()

    json_payload = """
    {
      "story_beats": ["开始", "变化"],
      "entities_outline": [{"id": "node-main", "kind": "node", "label": "Subject"}],
      "step_captions": [
        {"caption_title": "开始", "caption_body": "先看核心对象。"},
        {"caption_title": "变化", "caption_body": "观察主要变化。"}
      ],
      "action_hints": [["highlight"], ["move"]],
      "layout_intent": "subject centered",
      "focus_targets": ["node-main"],
      "family_hint": "system_flow",
      "style_tone": "clean_system"
    }
    """

    monkeypatch.setenv("LARGE_MODEL", "qwen3.5-flash-2026-02-23")
    monkeypatch.setenv("DEFAULT_MODEL", "qwen3.5-flash-2026-02-23")
    monkeypatch.delenv("ANIMATION_RUNTIME_MODEL", raising=False)
    monkeypatch.delenv("ANIMATION_RUNTIME_REPAIR_MODEL", raising=False)
    monkeypatch.setattr(animation_runtime_llm, "acompletion", _fake_completion)

    payload, meta = await animation_runtime_llm.generate_animation_runtime_plan_with_llm(
        _generic_content("system_flow"),
        family_hint="system_flow",
        prompt_digest="digest",
    )

    assert captured["model"] == "dashscope/qwen3.5-flash-2026-02-23"
    assert captured["response_format_type"] == "json_schema"
    assert captured["strict"] is True
    assert captured["result_format"] == "message"
    assert captured["enable_thinking"] is False
    assert payload["family_hint"] == "system_flow"
    assert meta["runtime_provider"] == "dashscope"
    assert meta["has_reasoning_content"] is True


@pytest.mark.asyncio
async def test_normalize_demonstration_animation_payload_does_not_force_algorithm_seed_when_steps_missing(
    monkeypatch,
):
    captured: dict[str, object] = {}

    def _fake_normalize(content: dict):
        captured["normalized_input"] = dict(content)
        return content

    async def _fake_enrich(content: dict):
        return dict(content)

    monkeypatch.setattr(
        "services.artifact_generator.animation_spec.normalize_animation_spec",
        _fake_normalize,
    )
    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.enrich_animation_runtime_snapshot_async",
        _fake_enrich,
    )

    await normalize_demonstration_animation_payload(
        {
            "title": "排序动画",
            "steps": [{"title": "引入", "caption": "没有 snapshot"}],
        },
        {"topic": "冒泡排序"},
    )

    normalized_input = captured["normalized_input"]
    assert isinstance(normalized_input, dict)
    assert "use_deterministic_algorithm_seed" not in normalized_input


@pytest.mark.asyncio
async def test_normalize_demonstration_animation_payload_respects_explicit_algorithm_seed_flag(
    monkeypatch,
):
    captured: dict[str, object] = {}

    def _fake_normalize(content: dict):
        captured["normalized_input"] = dict(content)
        return content

    async def _fake_enrich(content: dict):
        return dict(content)

    monkeypatch.setattr(
        "services.artifact_generator.animation_spec.normalize_animation_spec",
        _fake_normalize,
    )
    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.enrich_animation_runtime_snapshot_async",
        _fake_enrich,
    )

    await normalize_demonstration_animation_payload(
        {
            "title": "排序动画",
            "steps": [{"snapshot": [5, 3, 2]}],
        },
        {"topic": "冒泡排序", "use_deterministic_algorithm_seed": True},
    )

    normalized_input = captured["normalized_input"]
    assert isinstance(normalized_input, dict)
    assert normalized_input.get("use_deterministic_algorithm_seed") is True


@pytest.mark.asyncio
async def test_normalize_demonstration_animation_payload_fails_on_runtime_compile_error(
    monkeypatch,
):
    async def _compile_error_snapshot(content: dict):
        snapshot = dict(content)
        snapshot["compile_status"] = "error"
        snapshot["compile_errors"] = [
            {"message": "runtime graph validation failed", "source": "schema"}
        ]
        snapshot["runtime_validation_report"] = [
            {
                "stage": "graph_assembly_error",
                "message": "runtime graph validation failed",
                "rule_id": "runtime-graph-invalid",
            }
        ]
        return snapshot

    monkeypatch.setattr(
        "services.artifact_generator.animation_runtime.enrich_animation_runtime_snapshot_async",
        _compile_error_snapshot,
    )

    with pytest.raises(APIException) as exc_info:
        await normalize_demonstration_animation_payload(_algorithm_content(), {})

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["code"] == "INVALID_INPUT"
    details = exc_info.value.detail["details"]
    assert details["error_code"] == "ANIMATION_RUNTIME_COMPILE_FAILED"
    assert details["invalid_field"] == "runtime_graph"
    assert details["invalid_value"] == "compile_error"
