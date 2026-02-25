"""Auth API behavior tests."""

from unittest.mock import AsyncMock

from main import app
from services.auth_service import auth_service
from utils.dependencies import get_current_user


def test_me_returns_invalid_token_when_user_not_found(client, monkeypatch):
    """`/auth/me` should return 401 INVALID_TOKEN for missing user."""
    app.dependency_overrides[get_current_user] = lambda: "missing-user-id"
    monkeypatch.setattr(auth_service, "get_user_by_id", AsyncMock(return_value=None))

    try:
        response = client.get("/api/v1/auth/me")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_TOKEN"
