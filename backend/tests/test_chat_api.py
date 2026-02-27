"""Chat API endpoint tests (Batch C5)."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services import db_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_MSG = {"project_id": "p-001", "content": "Hello AI"}


def _fake_project(user_id="u-001"):
    return SimpleNamespace(id="p-001", userId=user_id, name="Test")


def _fake_conv(**kw):
    defaults = dict(
        id="c-001",
        projectId="p-001",
        role="user",
        content="Hello AI",
        metadata=None,
        createdAt=_NOW,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _mock(mp, attr, rv=None):
    """Shorthand: monkeypatch db_service.<attr> with AsyncMock."""
    mp.setattr(db_service, attr, AsyncMock(return_value=rv))


@pytest.fixture()
def _as_user():
    """Override get_current_user → 'u-001'."""
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)


# POST /chat/messages


def test_send_message_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, "get_project", _fake_project())
    _mock(monkeypatch, "create_conversation", _fake_conv())
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["message"]["role"] == "user"
    assert body["data"]["message"]["content"] == "Hello AI"
    assert body["data"]["suggestions"] == []


def test_send_message_no_token_401(client):
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 401


def test_send_message_wrong_owner_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, "get_project", _fake_project(user_id="other"))
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "FORBIDDEN"


def test_send_message_project_not_found_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, "get_project", None)
    resp = client.post("/api/v1/chat/messages", json=_MSG)
    assert resp.status_code == 403


# GET /chat/messages


def test_get_messages_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, "get_project", _fake_project())
    convs = [_fake_conv(id="c-001"), _fake_conv(id="c-002")]
    _mock(monkeypatch, "get_conversations_paginated", (convs, 2))
    resp = client.get("/api/v1/chat/messages?project_id=p-001")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["total"] == 2
    assert body["data"]["page"] == 1
    assert len(body["data"]["messages"]) == 2


def test_get_messages_no_token_401(client):
    resp = client.get("/api/v1/chat/messages?project_id=p-001")
    assert resp.status_code == 401


def test_get_messages_wrong_owner_403(client, monkeypatch, _as_user):
    _mock(monkeypatch, "get_project", _fake_project(user_id="other"))
    resp = client.get("/api/v1/chat/messages?project_id=p-001")
    assert resp.status_code == 403


def test_get_messages_missing_project_id_400(client, _as_user):
    resp = client.get("/api/v1/chat/messages")
    assert resp.status_code == 400


def test_voice_message_no_token_401(client):
    resp = client.post("/api/v1/chat/voice")
    assert resp.status_code == 401


def test_voice_message_not_implemented_501(client, _as_user):
    resp = client.post("/api/v1/chat/voice")
    assert resp.status_code == 501
