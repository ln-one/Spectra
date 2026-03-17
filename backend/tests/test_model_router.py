"""Model router tests (D-8.4)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services import ai as ai_module
from services.ai import AIService
from services.model_router import ModelRouter, ModelRouteTask


def _fake_completion_response(content: str = "ok", tokens: int = 12):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(total_tokens=tokens),
    )


class TestModelRouterRules:
    def test_light_task_uses_light_model(self):
        router = ModelRouter(heavy_model="qwen-max", light_model="qwen-turbo")
        decision = router.route(ModelRouteTask.INTENT_CLASSIFICATION.value)
        assert decision.selected_model == "qwen-turbo"
        assert decision.reason == "lightweight_task"

    def test_heavy_task_uses_heavy_model(self):
        router = ModelRouter(heavy_model="qwen-max", light_model="qwen-turbo")
        decision = router.route(ModelRouteTask.LESSON_PLAN_REASONING.value)
        assert decision.selected_model == "qwen-max"
        assert decision.reason == "reasoning_or_rag_heavy_task"

    def test_adaptive_chat_with_rag_uses_heavy_model(self):
        router = ModelRouter(heavy_model="qwen-max", light_model="qwen-turbo")
        decision = router.route(
            ModelRouteTask.CHAT_RESPONSE.value,
            prompt="简短问题",
            has_rag_context=True,
        )
        assert decision.selected_model == "qwen-max"
        assert decision.reason == "chat_with_rag_context"

    def test_adaptive_chat_without_rag_uses_light_model(self):
        router = ModelRouter(heavy_model="qwen-max", light_model="qwen-turbo")
        decision = router.route(
            ModelRouteTask.CHAT_RESPONSE.value,
            prompt="一句短问题",
            has_rag_context=False,
        )
        assert decision.selected_model == "qwen-turbo"
        assert decision.reason == "chat_lightweight"

    def test_supported_tasks_cover_required_issue_scope(self):
        tasks = set(ModelRouter.supported_tasks())
        assert ModelRouteTask.INTENT_CLASSIFICATION.value in tasks
        assert ModelRouteTask.TITLE_POLISH.value in tasks
        assert ModelRouteTask.OUTLINE_FORMATTING.value in tasks
        assert ModelRouteTask.RAG_DEEP_SUMMARY.value in tasks
        assert ModelRouteTask.LESSON_PLAN_REASONING.value in tasks
        assert ModelRouteTask.PREVIEW_MODIFICATION.value in tasks

    def test_supported_tasks_keep_stable_order_for_audit_outputs(self):
        tasks = list(ModelRouter.supported_tasks())
        assert tasks == [
            ModelRouteTask.INTENT_CLASSIFICATION.value,
            ModelRouteTask.TITLE_POLISH.value,
            ModelRouteTask.OUTLINE_FORMATTING.value,
            ModelRouteTask.SHORT_TEXT_POLISH.value,
            ModelRouteTask.CHAT_RESPONSE.value,
            ModelRouteTask.RAG_DEEP_SUMMARY.value,
            ModelRouteTask.LESSON_PLAN_REASONING.value,
            ModelRouteTask.PREVIEW_MODIFICATION.value,
        ]

    def test_policy_table_contains_required_mapping_fields(self):
        rows = ModelRouter.policy_table()
        assert len(rows) == len(tuple(ModelRouter.supported_tasks()))
        for row in rows:
            assert set(row.keys()) == {
                "task",
                "complexity",
                "default_model_tier",
                "fallback_model_tier",
                "rule",
            }
        task_rows = {row["task"]: row for row in rows}
        assert (
            task_rows[ModelRouteTask.LESSON_PLAN_REASONING.value]["default_model_tier"]
            == "heavy"
        )
        assert task_rows[ModelRouteTask.CHAT_RESPONSE.value]["complexity"] == "adaptive"


@pytest.mark.asyncio
async def test_ai_generate_routes_to_small_model(monkeypatch):
    monkeypatch.setenv("DEFAULT_MODEL", "qwen3.5-plus")
    monkeypatch.setenv("LARGE_MODEL", "qwen-max")
    monkeypatch.setenv("SMALL_MODEL", "qwen-turbo")
    svc = AIService()

    completion_mock = AsyncMock(return_value=_fake_completion_response("intent ok"))
    monkeypatch.setattr(ai_module, "acompletion", completion_mock)

    result = await svc.generate(
        prompt="请判断意图",
        route_task=ModelRouteTask.INTENT_CLASSIFICATION.value,
        max_tokens=64,
    )

    assert completion_mock.await_args.kwargs["model"] == "dashscope/qwen-turbo"
    assert result["route"]["selected_model"] == "qwen-turbo"
    assert result["route"]["task"] == ModelRouteTask.INTENT_CLASSIFICATION.value


@pytest.mark.asyncio
async def test_ai_generate_routes_chat_with_rag_to_large_model(monkeypatch):
    monkeypatch.setenv("DEFAULT_MODEL", "qwen3.5-plus")
    monkeypatch.setenv("LARGE_MODEL", "qwen-max")
    monkeypatch.setenv("SMALL_MODEL", "qwen-turbo")
    svc = AIService()

    completion_mock = AsyncMock(return_value=_fake_completion_response("chat ok"))
    monkeypatch.setattr(ai_module, "acompletion", completion_mock)

    await svc.generate(
        prompt="请结合资料回答",
        route_task=ModelRouteTask.CHAT_RESPONSE.value,
        has_rag_context=True,
        max_tokens=128,
    )

    assert completion_mock.await_args.kwargs["model"] == "dashscope/qwen-max"


@pytest.mark.asyncio
async def test_ai_generate_with_explicit_model_bypasses_router(monkeypatch):
    monkeypatch.setenv("DEFAULT_MODEL", "qwen3.5-plus")
    monkeypatch.setenv("LARGE_MODEL", "qwen-max")
    monkeypatch.setenv("SMALL_MODEL", "qwen-turbo")
    svc = AIService()

    completion_mock = AsyncMock(return_value=_fake_completion_response("manual model"))
    monkeypatch.setattr(ai_module, "acompletion", completion_mock)

    result = await svc.generate(
        prompt="manual",
        model="gpt-4o-mini",
        route_task=ModelRouteTask.LESSON_PLAN_REASONING.value,
        max_tokens=32,
    )

    assert completion_mock.await_args.kwargs["model"] == "gpt-4o-mini"
    assert result["route"] is None
