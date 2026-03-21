"""Chat API endpoint tests (PR-34 compatible C5)."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.ai import ai_service
from services.database import db_service
from services.generation_session_service import GenerationSessionService
from services.rag_service import rag_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_MSG = {"project_id": "p-001", "content": "Hello AI"}


def _fake_project(user_id="u-001"):
    return SimpleNamespace(id="p-001", userId=user_id, name="Test Project")


def _fake_conv(role="user", content="Hello AI", conv_id="c-001", **kw):
    defaults = dict(
        id=conv_id,
        projectId="p-001",
        role=role,
        content=content,
        metadata=None,
        createdAt=_NOW,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _fake_rag_result(
    content="资料内容",
    chunk_id="chunk-1",
    filename="notes.pdf",
    score=0.92,
):
    return SimpleNamespace(
        content=content,
        score=score,
        source=SimpleNamespace(
            chunk_id=chunk_id,
            source_type="document",
            filename=filename,
            page_number=2,
            timestamp=None,
            preview_text=None,
        ),
    )


def _mock(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def _mock_chat_bootstrap_session(monkeypatch):
    monkeypatch.setattr(
        GenerationSessionService,
        "create_session",
        AsyncMock(return_value={"session_id": "s-bootstrap-001"}),
    )


def test_send_message_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        db_service,
        "create_conversation_message",
        AsyncMock(
            side_effect=[
                _fake_conv(role="user", conv_id="c-user"),
                _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
            ]
        ),
    )
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(monkeypatch, ai_service, "generate", {"content": "assistant reply"})

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["message"]["role"] == "assistant"
    assert body["data"]["message"]["content"] == "assistant reply"
    assert len(body["data"]["suggestions"]) == 3


def test_send_message_bootstraps_session_when_missing(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        GenerationSessionService,
        "create_session",
        AsyncMock(return_value={"session_id": "s-bootstrap-001"}),
    )
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user", sessionId="s-bootstrap-001"),
            _fake_conv(
                role="assistant",
                content="assistant reply",
                conv_id="c-ai",
                sessionId="s-bootstrap-001",
            ),
        ]
    )
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(monkeypatch, rag_service, "search", [])
    _mock(monkeypatch, ai_service, "generate", {"content": "assistant reply"})

    resp = client.post("/api/v1/chat/messages", json=_MSG)

    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["session_id"] == "s-bootstrap-001"
    assert create_mock.await_args_list[0].kwargs["session_id"] == "s-bootstrap-001"


def test_send_message_rewrites_mechanical_option_reply(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        db_service,
        "create_conversation_message",
        AsyncMock(
            side_effect=[
                _fake_conv(role="user", conv_id="c-user"),
                _fake_conv(role="assistant", content="rewritten reply", conv_id="c-ai"),
            ]
        ),
    )
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )

    generate_mock = AsyncMock(
        side_effect=[
            {"content": "你可以选择 A/B/C 三种方式来推进。"},
            {"content": "先从一个生活化情境切入，再补一个可直接落地的小练习。"},
        ]
    )
    monkeypatch.setattr(ai_service, "generate", generate_mock)

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["message"]["content"] == "rewritten reply"
    assert generate_mock.await_count == 2


def test_send_message_scopes_recent_messages_by_session(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        db_service,
        "create_conversation_message",
        AsyncMock(
            side_effect=[
                _fake_conv(role="user", conv_id="c-user"),
                _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
            ]
        ),
    )
    recent_mock = AsyncMock(
        return_value=[_fake_conv(role="user", content="in session")]
    )
    monkeypatch.setattr(db_service, "get_recent_conversation_messages", recent_mock)
    _mock(monkeypatch, rag_service, "search", [])
    _mock(monkeypatch, ai_service, "generate", {"content": "assistant reply"})

    resp = client.post(
        "/api/v1/chat/messages",
        json={"project_id": "p-001", "session_id": "s-001", "content": "Hello AI"},
    )
    assert resp.status_code == 200
    recent_mock.assert_awaited_once_with(
        project_id="p-001",
        limit=6,
        session_id="s-001",
        select={"role": True, "content": True},
    )


def test_send_message_persists_card_refine_metadata(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user"),
            _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
        ]
    )
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    generate_mock = AsyncMock(return_value={"content": "assistant reply"})
    monkeypatch.setattr(ai_service, "generate", generate_mock)

    resp = client.post(
        "/api/v1/chat/messages",
        json={
            "project_id": "p-001",
            "content": "把这段改得更自然一点",
            "metadata": {
                "card_id": "speaker_notes",
                "source_artifact_id": "a-ppt-001",
                "selected_script_segment": "slide-3:transition",
            },
        },
    )

    assert resp.status_code == 200
    saved_user_metadata = create_mock.await_args_list[0].kwargs["metadata"]
    assert saved_user_metadata["card_id"] == "speaker_notes"
    assert saved_user_metadata["source_artifact_id"] == "a-ppt-001"
    prompt = generate_mock.await_args.kwargs["prompt"]
    assert "speaker_notes" in prompt
    assert "slide-3:transition" in prompt


def test_send_message_converts_numeric_marker_to_cite_tag(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user"),
            _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
        ]
    )
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(monkeypatch, rag_service, "search", [_fake_rag_result()])
    _mock(monkeypatch, ai_service, "generate", {"content": "根据资料可以这样讲。[1]"})

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200

    saved_assistant_content = create_mock.await_args_list[1].kwargs["content"]
    assert '<cite chunk_id="chunk-1"' in saved_assistant_content
    assert "[1]" not in saved_assistant_content


def test_send_message_aligns_citations_with_inline_cite_tags(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user"),
            _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
        ]
    )
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(
        monkeypatch,
        rag_service,
        "search",
        [
            _fake_rag_result(chunk_id="chunk-1", filename="a.pdf", score=0.91),
            _fake_rag_result(chunk_id="chunk-2", filename="b.pdf", score=0.89),
        ],
    )
    _mock(monkeypatch, ai_service, "generate", {"content": "优先参考第二条资料。[2]"})

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200

    saved_assistant_content = create_mock.await_args_list[1].kwargs["content"]
    saved_metadata = create_mock.await_args_list[1].kwargs["metadata"]
    assert '<cite chunk_id="chunk-2"' in saved_assistant_content
    assert "[2]" not in saved_assistant_content
    assert len(saved_metadata["citations"]) == 1
    assert saved_metadata["citations"][0]["chunk_id"] == "chunk-2"


def test_send_message_response_contract_aligns_rag_and_observability(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        db_service,
        "create_conversation_message",
        AsyncMock(
            side_effect=[
                _fake_conv(role="user", conv_id="c-user"),
                _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
            ]
        ),
    )
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(monkeypatch, rag_service, "search", [_fake_rag_result(chunk_id="chunk-1")])
    _mock(monkeypatch, ai_service, "generate", {"content": "根据资料结论。[1]"})

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["rag_hit"] is True
    assert body["observability"]["has_rag_context"] is True
    assert isinstance(body["message"]["citations"], list)
    assert body["message"]["citations"][0]["chunk_id"] == "chunk-1"


def test_send_message_sanitizes_unknown_cite_tag_and_recovers_mapping(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user"),
            _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
        ]
    )
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(monkeypatch, rag_service, "search", [_fake_rag_result(chunk_id="chunk-1")])
    _mock(
        monkeypatch,
        ai_service,
        "generate",
        {"content": '基于资料结论如下。<cite chunk_id="unknown-1"></cite>'},
    )

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200

    saved_assistant_content = create_mock.await_args_list[1].kwargs["content"]
    saved_metadata = create_mock.await_args_list[1].kwargs["metadata"]
    assert 'chunk_id="unknown-1"' not in saved_assistant_content
    assert '<cite chunk_id="chunk-1"' in saved_assistant_content
    assert saved_metadata["citations"][0]["chunk_id"] == "chunk-1"


def test_send_message_strips_cite_tag_without_chunk_id(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user"),
            _fake_conv(role="assistant", content="assistant reply", conv_id="c-ai"),
        ]
    )
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)
    _mock(
        monkeypatch,
        db_service,
        "get_recent_conversation_messages",
        [_fake_conv(role="user", content="previous message")],
    )
    _mock(monkeypatch, rag_service, "search", [_fake_rag_result(chunk_id="chunk-1")])
    _mock(
        monkeypatch,
        ai_service,
        "generate",
        {"content": '结论如下。<cite filename="notes.pdf"></cite>'},
    )

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200

    saved_assistant_content = create_mock.await_args_list[1].kwargs["content"]
    assert '<cite filename="notes.pdf"></cite>' not in saved_assistant_content
    assert '<cite chunk_id="chunk-1"' in saved_assistant_content


def test_send_message_idempotency_hit_returns_cached(client, monkeypatch, _as_user):
    cached = {
        "success": True,
        "data": {
            "message": {
                "id": "cached-msg",
                "role": "assistant",
                "content": "cached reply",
                "timestamp": _NOW.isoformat(),
            },
            "suggestions": ["s1", "s2"],
        },
        "message": "cached",
    }
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", cached)

    create_mock = AsyncMock()
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)

    resp = client.post(
        "/api/v1/chat/messages",
        json=_MSG,
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000001"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["message"]["id"] == "cached-msg"
    create_mock.assert_not_awaited()


def test_send_message_invalid_idempotency_key_400(client, _as_user):
    resp = client.post(
        "/api/v1/chat/messages",
        json=_MSG,
        headers={"Idempotency-Key": "invalid-uuid"},
    )
    assert resp.status_code == 400


def test_send_message_no_token_401(client):
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 401


def test_send_message_wrong_owner_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_send_message_project_not_found_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", None)
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 403


def test_send_message_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(side_effect=RuntimeError("db unavailable")),
    )

    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "发送消息失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_get_messages_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    convs = [
        _fake_conv(role="user", conv_id="c-001", sessionId="s-001"),
        _fake_conv(role="assistant", conv_id="c-002", sessionId="s-001"),
    ]
    _mock(monkeypatch, db_service, "get_conversation_messages", convs)
    _mock(monkeypatch, db_service, "count_conversation_messages", 2)
    resp = client.get(
        "/api/v1/chat/messages?project_id=p-001&page=1&limit=20&session_id=s-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["total"] == 2
    assert body["data"]["page"] == 1
    assert len(body["data"]["messages"]) == 2


def test_get_messages_returns_session_scope_in_payload(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_conversation_messages", [])
    _mock(monkeypatch, db_service, "count_conversation_messages", 0)

    resp = client.get(
        "/api/v1/chat/messages?project_id=p-001&page=1&limit=20&session_id=s-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["session_id"] == "s-001"


def test_get_messages_includes_citations_from_metadata(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    expected_citations = [
        {
            "chunk_id": "chunk-1",
            "source_type": "document",
            "filename": "notes.pdf",
            "page_number": 2,
            "timestamp": None,
            "score": 0.92,
        }
    ]
    convs = [
        _fake_conv(
            role="assistant",
            conv_id="c-001",
            sessionId="s-001",
            metadata='{"citations":[{"chunk_id":"chunk-1","source_type":"document","filename":"notes.pdf","page_number":2,"score":0.92}]}',
        ),
    ]
    _mock(monkeypatch, db_service, "get_conversation_messages", convs)
    _mock(monkeypatch, db_service, "count_conversation_messages", 1)

    resp = client.get(
        "/api/v1/chat/messages?project_id=p-001&page=1&limit=20&session_id=s-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["messages"][0]["citations"] == expected_citations


def test_get_messages_assistant_without_citations_returns_empty_array(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    resp = client.get("/api/v1/chat/messages?project_id=p-001&page=1&limit=20")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["messages"] == []
    assert body["data"]["total"] == 0


def test_get_messages_with_session_returns_scoped_history(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    convs = [
        _fake_conv(
            role="assistant",
            conv_id="c-001",
            metadata=None,
            sessionId="s-001",
        )
    ]
    conversation_messages_mock = AsyncMock(return_value=convs)
    count_messages_mock = AsyncMock(return_value=1)
    monkeypatch.setattr(
        db_service, "get_conversation_messages", conversation_messages_mock
    )
    monkeypatch.setattr(db_service, "count_conversation_messages", count_messages_mock)

    resp = client.get(
        "/api/v1/chat/messages?project_id=p-001&page=1&limit=20&session_id=s-001"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["messages"][0]["citations"] == []
    conversation_messages_mock.assert_awaited_once_with(
        project_id="p-001",
        page=1,
        limit=20,
        session_id="s-001",
    )
    count_messages_mock.assert_awaited_once_with(
        project_id="p-001",
        session_id="s-001",
    )


def test_get_messages_no_token_401(client):
    resp = client.get("/api/v1/chat/messages?project_id=p-001")
    assert resp.status_code == 401


def test_get_messages_wrong_owner_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))
    resp = client.get("/api/v1/chat/messages?project_id=p-001")
    assert resp.status_code == 403


def test_get_messages_missing_project_id_400(client, _as_user):
    resp = client.get("/api/v1/chat/messages")
    assert resp.status_code == 400


def test_get_messages_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        db_service,
        "get_conversation_messages",
        AsyncMock(side_effect=RuntimeError("query failed")),
    )
    _mock(monkeypatch, db_service, "count_conversation_messages", 0)

    resp = client.get(
        "/api/v1/chat/messages?project_id=p-001&page=1&limit=20&session_id=s-001"
    )
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "获取消息失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]


def test_voice_message_no_token_401(client):
    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 401


def test_voice_message_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        GenerationSessionService,
        "create_session",
        AsyncMock(return_value={"session_id": "s-voice-001"}),
    )
    monkeypatch.setattr(
        "services.media.audio.transcribe_audio",
        lambda *_args, **_kwargs: (
            "语音识别文本",
            0.91,
            1.8,
            SimpleNamespace(
                model_dump=lambda: {
                    "capability": "speech_recognition",
                    "provider": "Faster-Whisper",
                    "status": "available",
                    "fallback_used": False,
                },
                user_message=None,
            ),
        ),
    )
    create_mock = AsyncMock(
        side_effect=[
            _fake_conv(role="user", conv_id="c-user", sessionId="s-voice-001"),
            _fake_conv(
                role="assistant",
                content="voice assistant reply",
                conv_id="c-ai",
                sessionId="s-voice-001",
            ),
        ]
    )
    monkeypatch.setattr(
        db_service,
        "create_conversation_message",
        create_mock,
    )

    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["text"]
    assert body["data"]["rag_hit"] is False
    assert body["data"]["message"]["role"] == "assistant"
    assert body["data"]["message"]["content"] == "voice assistant reply"
    assert body["data"]["message"]["citations"] == []
    assert body["data"]["session_id"] == "s-voice-001"
    assert create_mock.await_args_list[0].kwargs["session_id"] == "s-voice-001"
    assert body["data"]["observability"]["route_task"] == "speech_recognition"
    assert body["data"]["observability"]["has_rag_context"] is False
    assert body["data"]["duration"] >= 1


def test_voice_message_idempotency_hit_returns_cached(client, monkeypatch, _as_user):
    cached = {
        "success": True,
        "data": {
            "text": "cached text",
            "confidence": 0.99,
            "duration": 1.2,
            "message": {
                "id": "cached-voice-msg",
                "role": "assistant",
                "content": "cached voice reply",
                "timestamp": _NOW.isoformat(),
            },
            "suggestions": ["a", "b"],
        },
        "message": "cached voice",
    }
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    _mock(monkeypatch, db_service, "get_idempotency_response", cached)
    create_mock = AsyncMock()
    monkeypatch.setattr(db_service, "create_conversation_message", create_mock)

    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
        headers={"Idempotency-Key": "00000000-0000-0000-0000-000000000002"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["message"]["id"] == "cached-voice-msg"
    create_mock.assert_not_awaited()


def test_voice_message_forbidden_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project(user_id="other"))
    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 403


def test_voice_message_invalid_idempotency_key_400(client, _as_user):
    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
        headers={"Idempotency-Key": "invalid-uuid"},
    )
    assert resp.status_code == 400


def test_voice_message_internal_error_uses_unified_error_contract(
    client, monkeypatch, _as_user
):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    monkeypatch.setattr(
        "services.media.audio.transcribe_audio",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("stt down")),
    )

    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "语音处理失败"
    assert body["error"]["retryable"] is False
    assert body["error"]["trace_id"]
