from schemas.chat import ChatObservability, ChatRouteTask
from services.ai.model_router import ModelRouteTask


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
