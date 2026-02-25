"""Unit tests for auth service and user database methods (Batch C2)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import jwt
import pytest

import services.auth_service as auth_module
from services.auth_service import AuthService
from services.database import DatabaseService


@pytest.fixture
def auth_service() -> AuthService:
    return AuthService()


def test_hash_and_verify_password_success(auth_service: AuthService):
    password = "StrongPwd123!"
    hashed = auth_service.hash_password(password)

    assert hashed != password
    assert auth_service.verify_password(password, hashed) is True


def test_verify_password_fail_for_wrong_password(auth_service: AuthService):
    hashed = auth_service.hash_password("StrongPwd123!")

    assert auth_service.verify_password("WrongPwd999!", hashed) is False


def test_create_and_verify_token_success(auth_service: AuthService):
    token = auth_service.create_token("user-001")
    token_pair = auth_service.create_auth_tokens("user-001")

    assert isinstance(token, str)
    assert auth_service.verify_token(token) == "user-001"
    assert auth_service.verify_refresh_token(token_pair["refresh_token"]) == "user-001"
    assert token_pair["expires_in"] > 0


def test_verify_token_returns_none_for_expired(auth_service: AuthService):
    expired_payload = {
        "sub": "user-expired",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    token = jwt.encode(
        expired_payload,
        auth_module.JWT_SECRET_KEY,
        algorithm=auth_module.JWT_ALGORITHM,
    )

    assert auth_service.verify_token(token) is None


def test_verify_token_returns_none_for_tampered(auth_service: AuthService):
    token = auth_service.create_token("user-001")

    assert auth_service.verify_token(f"{token}tampered") is None


@pytest.mark.asyncio
async def test_create_user_hashes_password_and_calls_db(monkeypatch):
    fake_db_service = SimpleNamespace(
        create_user=AsyncMock(
            return_value=SimpleNamespace(id="u1", email="u@test.com", username="u1")
        )
    )
    monkeypatch.setattr(auth_module, "db_service", fake_db_service)

    user = await auth_module.auth_service.create_user(
        email="u@test.com",
        password="StrongPwd123!",
        username="u1",
        full_name="User One",
    )

    assert user.email == "u@test.com"
    fake_db_service.create_user.assert_awaited_once()
    kwargs = fake_db_service.create_user.await_args.kwargs
    assert kwargs["email"] == "u@test.com"
    assert kwargs["username"] == "u1"
    assert kwargs["full_name"] == "User One"
    assert kwargs["password_hash"] != "StrongPwd123!"


@pytest.mark.asyncio
async def test_authenticate_user_success(monkeypatch):
    service = AuthService()
    hashed = service.hash_password("StrongPwd123!")
    fake_user = SimpleNamespace(
        id="u1",
        email="u@test.com",
        username="u1",
        password=hashed,
    )
    fake_db_service = SimpleNamespace(
        get_user_by_email=AsyncMock(return_value=fake_user)
    )
    monkeypatch.setattr(auth_module, "db_service", fake_db_service)

    user = await service.authenticate_user("u@test.com", "StrongPwd123!")

    assert user is not None
    assert user.id == "u1"


@pytest.mark.asyncio
async def test_authenticate_user_fail_for_wrong_password(monkeypatch):
    service = AuthService()
    hashed = service.hash_password("StrongPwd123!")
    fake_user = SimpleNamespace(
        id="u1",
        email="u@test.com",
        username="u1",
        password=hashed,
    )
    fake_db_service = SimpleNamespace(
        get_user_by_email=AsyncMock(return_value=fake_user)
    )
    monkeypatch.setattr(auth_module, "db_service", fake_db_service)

    user = await service.authenticate_user("u@test.com", "WrongPwd999!")

    assert user is None


@pytest.mark.asyncio
async def test_authenticate_user_fail_for_missing_user(monkeypatch):
    service = AuthService()
    fake_db_service = SimpleNamespace(get_user_by_email=AsyncMock(return_value=None))
    monkeypatch.setattr(auth_module, "db_service", fake_db_service)

    user = await service.authenticate_user("missing@test.com", "StrongPwd123!")

    assert user is None


@pytest.mark.asyncio
async def test_get_user_by_id_calls_db(monkeypatch):
    fake_user = SimpleNamespace(id="u1", email="u@test.com", username="u1")
    fake_db_service = SimpleNamespace(get_user_by_id=AsyncMock(return_value=fake_user))
    monkeypatch.setattr(auth_module, "db_service", fake_db_service)

    user = await auth_module.auth_service.get_user_by_id("u1")

    assert user.id == "u1"
    fake_db_service.get_user_by_id.assert_awaited_once_with("u1")


@pytest.mark.asyncio
async def test_database_create_user_maps_fields():
    service = DatabaseService()
    mock_user_model = SimpleNamespace(
        create=AsyncMock(return_value=SimpleNamespace(id="u1"))
    )
    service.db = SimpleNamespace(user=mock_user_model)

    await service.create_user(
        email="u@test.com",
        password_hash="hashed-pass",
        username="u1",
        full_name="User One",
    )

    mock_user_model.create.assert_awaited_once()
    data = mock_user_model.create.await_args.kwargs["data"]
    assert data["email"] == "u@test.com"
    assert data["password"] == "hashed-pass"
    assert data["username"] == "u1"
    assert data["fullName"] == "User One"


@pytest.mark.asyncio
async def test_database_get_user_helpers():
    service = DatabaseService()
    mock_user_model = SimpleNamespace(find_unique=AsyncMock(return_value=None))
    service.db = SimpleNamespace(user=mock_user_model)

    await service.get_user_by_email("u@test.com")
    await service.get_user_by_username("u1")
    await service.get_user_by_id("id-001")

    calls = [
        call.kwargs["where"] for call in mock_user_model.find_unique.await_args_list
    ]
    assert {"email": "u@test.com"} in calls
    assert {"username": "u1"} in calls
    assert {"id": "id-001"} in calls
