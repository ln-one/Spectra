"""Auth API endpoint tests."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import routers.auth as auth_router_module
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_REG = {
    "email": "test@example.com",
    "password": "StrongPwd123",
    "username": "testuser",
}
_LOGIN = {"email": "test@example.com", "password": "StrongPwd123"}


def _fake_user(**kw):
    payload = dict(
        id="u-001",
        email="test@example.com",
        username="testuser",
        fullName="Test User",
        createdAt=_NOW,
    )
    payload.update(kw)
    return SimpleNamespace(**payload)


def _fake_client(status_code=200, payload=None, set_cookie_headers=None):
    body = payload or {"data": {"ok": True}}
    cookies = set_cookie_headers or ["better-auth.session_token=test; Path=/; HttpOnly"]

    return SimpleNamespace(
        sign_up_email=AsyncMock(
            return_value=SimpleNamespace(
                status_code=status_code,
                payload=body,
                set_cookie_headers=cookies,
            )
        ),
        sign_in_email=AsyncMock(
            return_value=SimpleNamespace(
                status_code=status_code,
                payload=body,
                set_cookie_headers=cookies,
            )
        ),
        revoke_current_session=AsyncMock(
            return_value=SimpleNamespace(
                status_code=status_code,
                payload=body,
                set_cookie_headers=["better-auth.session_token=; Max-Age=0; Path=/"],
            )
        ),
        get_current_session=AsyncMock(
            return_value=SimpleNamespace(
                identity_id="u-001",
                email="test@example.com",
                name="Test User",
                email_verified=True,
                session_id="sess-1",
                memberships=[],
            )
        ),
    )


@pytest.fixture()
def _as_user(client):
    client.app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    client.app.dependency_overrides.pop(get_current_user, None)


def test_register_success(client, monkeypatch):
    limora = _fake_client()
    monkeypatch.setattr(auth_router_module, "build_limora_client", lambda: limora)
    monkeypatch.setattr(
        auth_router_module.identity_service,
        "upsert_identity_user",
        AsyncMock(return_value=_fake_user()),
    )

    resp = client.post("/api/v1/auth/register", json=_REG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["user"]["id"] == "u-001"
    assert "set-cookie" in resp.headers


def test_register_conflict_passthrough(client, monkeypatch):
    limora = _fake_client(
        status_code=409,
        payload={"error": {"message": "邮箱已注册"}},
        set_cookie_headers=[],
    )
    monkeypatch.setattr(auth_router_module, "build_limora_client", lambda: limora)

    resp = client.post("/api/v1/auth/register", json=_REG)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "ALREADY_EXISTS"


def test_login_success(client, monkeypatch):
    limora = _fake_client()
    monkeypatch.setattr(auth_router_module, "build_limora_client", lambda: limora)
    monkeypatch.setattr(
        auth_router_module.identity_service,
        "upsert_identity_user",
        AsyncMock(return_value=_fake_user()),
    )

    resp = client.post("/api/v1/auth/login", json=_LOGIN)
    assert resp.status_code == 200
    assert resp.json()["data"]["user"]["id"] == "u-001"


def test_login_wrong_credentials_401(client, monkeypatch):
    limora = _fake_client(
        status_code=401,
        payload={"error": {"message": "邮箱或密码错误"}},
        set_cookie_headers=[],
    )
    monkeypatch.setattr(auth_router_module, "build_limora_client", lambda: limora)

    resp = client.post("/api/v1/auth/login", json=_LOGIN)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_me_success(client, monkeypatch, _as_user):
    monkeypatch.setattr(
        auth_router_module.identity_service,
        "get_user_by_id",
        AsyncMock(return_value=_fake_user()),
    )
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["data"]["user"]["email"] == "test@example.com"


def test_me_without_cookie_returns_401(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_does_not_accept_bearer_only(client):
    resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_logout_success(client, monkeypatch, _as_user):
    limora = _fake_client()
    monkeypatch.setattr(auth_router_module, "build_limora_client", lambda: limora)

    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert "set-cookie" in resp.headers
