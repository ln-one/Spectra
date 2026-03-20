from schemas.chat import ChatObservability, ChatRouteTask
from services.ai.model_router import (
    ModelRouteFailureReason,
    ModelRouteReason,
    ModelRouteTask,
    TaskComplexity,
)


def test_chat_observability_normalizes_chat_route_task_enum():
    payload = ChatObservability(
        request_id="req-001",
        route_task=ChatRouteTask.CHAT_RESPONSE,
        selected_model="qwen3.5-plus",
        has_rag_context=True,
        fallback_triggered=False,
    )

    assert payload.route_task == "chat_response"


def test_chat_observability_normalizes_model_route_task_enum():
    payload = ChatObservability(
        request_id="req-002",
        route_task=ModelRouteTask.SHORT_TEXT_POLISH,
        selected_model="qwen3.5-plus",
        has_rag_context=False,
        fallback_triggered=True,
    )

    assert payload.route_task == "short_text_polish"


def test_chat_observability_normalizes_route_decision_enums():
    payload = ChatObservability(
        request_id="req-003",
        route_task=ChatRouteTask.CHAT_RESPONSE,
        selected_model="qwen3.5-plus",
        has_rag_context=True,
        fallback_triggered=True,
        route_decision={
            "task": ModelRouteTask.CHAT_RESPONSE,
            "complexity": TaskComplexity.ADAPTIVE,
            "selected_model": "qwen3.5-plus",
            "fallback_model": "qwen-turbo",
            "reason": ModelRouteReason.CHAT_WITH_RAG_CONTEXT,
            "failure_reason": ModelRouteFailureReason.TIMEOUT,
            "fallback_triggered": True,
        },
    )

    assert payload.route_decision is not None
    assert payload.route_decision.task == "chat_response"
    assert payload.route_decision.complexity == "adaptive"
    assert payload.route_decision.reason == "chat_with_rag_context"
    assert payload.route_decision.failure_reason == "timeout"
