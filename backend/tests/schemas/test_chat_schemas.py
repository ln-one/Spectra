from datetime import datetime, timezone

from schemas.chat import (
    ChatObservability,
    ChatRouteTask,
    GetMessagesResponse,
    Message,
    SendMessageResponse,
    VoiceMessageResponse,
)
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


def test_chat_observability_supports_retrieval_and_policy_traceability():
    payload = ChatObservability(
        request_id="req-004",
        route_task=ChatRouteTask.CHAT_RESPONSE,
        selected_model="qwen3.5-plus",
        has_rag_context=True,
        fallback_triggered=False,
        retrieval_mode="strict_sources",
        policy_version="prompt-policy-v2026-03-28",
        baseline_id="prompt-baseline-v1",
    )

    assert payload.retrieval_mode == "strict_sources"
    assert payload.policy_version == "prompt-policy-v2026-03-28"
    assert payload.baseline_id == "prompt-baseline-v1"


def test_send_message_response_supports_contract_fields():
    message = Message(
        id="msg-1",
        role="assistant",
        content="ok",
        timestamp=datetime.now(timezone.utc),
        citations=[],
    )
    payload = SendMessageResponse(
        session_id="sess-1",
        message=message,
        rag_hit=True,
        observability={"route_task": "chat_response"},
        suggestions=["next"],
    )

    assert payload.session_id == "sess-1"
    assert payload.rag_hit is True
    assert payload.observability["route_task"] == "chat_response"


def test_voice_message_response_supports_capability_and_observability():
    message = Message(
        id="msg-2",
        role="assistant",
        content="voice reply",
        timestamp=datetime.now(timezone.utc),
        citations=[],
    )
    payload = VoiceMessageResponse(
        session_id="sess-voice-1",
        text="识别文本",
        confidence=0.9,
        duration=3.2,
        message=message,
        rag_hit=False,
        capability_status={"status": "available", "provider": "Faster-Whisper"},
        observability={"route_task": "speech_recognition"},
        suggestions=["补充教学目标"],
    )

    assert payload.session_id == "sess-voice-1"
    assert payload.rag_hit is False
    assert payload.capability_status["provider"] == "Faster-Whisper"
    assert payload.observability["route_task"] == "speech_recognition"


def test_get_messages_response_supports_optional_session_id():
    payload = GetMessagesResponse(
        session_id="sess-2",
        messages=[],
        total=0,
        page=1,
        limit=20,
    )
    assert payload.session_id == "sess-2"
