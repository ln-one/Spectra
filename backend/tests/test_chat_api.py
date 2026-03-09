"""Chat API endpoint tests (PR-34 compatible C5)."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services import db_service
from services.ai import ai_service
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


def _mock(mp, obj, attr, rv=None):
    mp.setattr(obj, attr, AsyncMock(return_value=rv))


@pytest.fixture()
def _as_user():
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)


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
        limit=10,
        session_id="s-001",
    )


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


def test_get_messages_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, db_service, "get_project", _fake_project())
    convs = [
        _fake_conv(role="user", conv_id="c-001"),
        _fake_conv(role="assistant", conv_id="c-002"),
    ]
    _mock(monkeypatch, db_service, "get_conversations_paginated", (convs, 2))
    resp = client.get("/api/v1/chat/messages?project_id=p-001&page=1&limit=20")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["total"] == 2
    assert body["data"]["page"] == 1
    assert len(body["data"]["messages"]) == 2


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
            metadata='{"citations":[{"chunk_id":"chunk-1","source_type":"document","filename":"notes.pdf","page_number":2,"score":0.92}]}',
        ),
    ]
    _mock(monkeypatch, db_service, "get_conversations_paginated", (convs, 1))

    resp = client.get("/api/v1/chat/messages?project_id=p-001&page=1&limit=20")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["messages"][0]["citations"] == expected_citations


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
        db_service,
        "create_conversation_message",
        AsyncMock(
            side_effect=[
                _fake_conv(role="user", conv_id="c-user"),
                _fake_conv(
                    role="assistant",
                    content="voice assistant reply",
                    conv_id="c-ai",
                ),
            ]
        ),
    )

    resp = client.post(
        "/api/v1/chat/voice",
        files={"audio": ("v.wav", b"abc", "audio/wav")},
        data={"project_id": "p-001"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["text"]
    assert body["data"]["message"]["role"] == "assistant"
    assert body["data"]["message"]["content"] == "voice assistant reply"
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
