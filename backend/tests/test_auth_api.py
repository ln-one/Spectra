"""Auth API endpoint tests (Batch C3)."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from main import app
from services.auth_service import auth_service
from utils.dependencies import get_current_user

_NOW = datetime.now(timezone.utc)
_REG = {
    "email": "test@example.com",
    "password": "StrongPwd123",
    "username": "testuser",
}
_LOGIN = {"email": "test@example.com", "password": "StrongPwd123"}


def _fake_user(**kw):
    d = dict(
        id="u-001",
        email="test@example.com",
        username="testuser",
        fullName="Test User",
        createdAt=_NOW,
        password="hashed",
    )
    d.update(kw)
    return SimpleNamespace(**d)


def _mock(mp, attr, rv=None):
    """Shorthand: monkeypatch auth_service.<attr> with AsyncMock."""
    mp.setattr(auth_service, attr, AsyncMock(return_value=rv))


@pytest.fixture()
def _as_user():
    """Override get_current_user → 'u-001'."""
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    yield
    app.dependency_overrides.pop(get_current_user, None)


# Register


def test_register_success(client, monkeypatch):
    _mock(monkeypatch, "get_user_by_email")
    _mock(monkeypatch, "get_user_by_username")
    _mock(monkeypatch, "create_user", _fake_user())
    resp = client.post("/api/v1/auth/register", json=_REG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "access_token" in body["data"]
    assert "refresh_token" in body["data"]
    assert body["data"]["expires_in"] > 0
    assert body["data"]["user"]["id"] == "u-001"


def test_register_dup_email_409(client, monkeypatch):
    _mock(monkeypatch, "get_user_by_email", _fake_user())
    resp = client.post("/api/v1/auth/register", json={**_REG, "username": "new"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "ALREADY_EXISTS"


def test_register_dup_username_409(client, monkeypatch):
    _mock(monkeypatch, "get_user_by_email")
    _mock(monkeypatch, "get_user_by_username", _fake_user())
    resp = client.post("/api/v1/auth/register", json={**_REG, "email": "n@e.com"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "ALREADY_EXISTS"


def test_register_short_password_400(client):
    resp = client.post("/api/v1/auth/register", json={**_REG, "password": "short"})
    assert resp.status_code == 400


# Login


def test_login_success(client, monkeypatch):
    _mock(monkeypatch, "authenticate_user", _fake_user())
    resp = client.post("/api/v1/auth/login", json=_LOGIN)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "access_token" in body["data"]
    assert "refresh_token" in body["data"]


def test_login_wrong_credentials_401(client, monkeypatch):
    _mock(monkeypatch, "authenticate_user")
    resp = client.post("/api/v1/auth/login", json=_LOGIN)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


# Me


def test_me_success(client, monkeypatch, _as_user):
    _mock(monkeypatch, "get_user_by_id", _fake_user())
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["user"]["id"] == "u-001"
    assert body["data"]["user"]["email"] == "test@example.com"


def test_me_no_token_401(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_bad_token_401(client):
    resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_TOKEN"


def test_me_user_not_found_401(client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: "gone"
    _mock(monkeypatch, "get_user_by_id")
    try:
        resp = client.get("/api/v1/auth/me")
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_TOKEN"


# Refresh


def test_refresh_success(client, monkeypatch):
    monkeypatch.setattr(auth_service, "verify_refresh_token", lambda t: "u-001")
    _mock(monkeypatch, "get_user_by_id", _fake_user())
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": "ok"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "access_token" in body["data"]
    assert "refresh_token" in body["data"]


def test_refresh_invalid_token_401(client, monkeypatch):
    monkeypatch.setattr(auth_service, "verify_refresh_token", lambda t: None)
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": "bad"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_TOKEN"


# Logout


def test_logout_success(client, _as_user):
    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_logout_no_token_401(client):
    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"
