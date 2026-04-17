"""Tests for local identity mirror helpers."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.auth_service import AuthService
from services.database import DatabaseService
from services.identity_service import IdentityService
from services.identity_service.usernames import normalize_username


@pytest.mark.asyncio
async def test_database_create_user_accepts_nullable_password():
    service = DatabaseService()
    mock_user_model = SimpleNamespace(
        create=AsyncMock(return_value=SimpleNamespace(id="u1"))
    )
    service.db = SimpleNamespace(user=mock_user_model)

    await service.create_user(
        email="u@test.com",
        password_hash=None,
        username="u1",
        full_name="User One",
    )

    data = mock_user_model.create.await_args.kwargs["data"]
    assert data["password"] is None


@pytest.mark.asyncio
async def test_database_upsert_user_identity_maps_fields():
    service = DatabaseService()
    mock_user_model = SimpleNamespace(
        find_first=AsyncMock(return_value=None),
        create=AsyncMock(return_value=SimpleNamespace(id="local-uuid-1")),
    )
    service.db = SimpleNamespace(user=mock_user_model)

    await service.upsert_user_identity(
        identity_id="id-001",
        email="u@test.com",
        username="user_one",
        full_name="User One",
    )

    data = mock_user_model.create.await_args.kwargs["data"]
    assert data["identityId"] == "id-001"
    assert data["password"] is None
    assert data["username"] == "user_one"


@pytest.mark.asyncio
async def test_identity_service_reuses_existing_username(monkeypatch):
    service = IdentityService()
    existing = SimpleNamespace(id="id-001", username="stable_name")
    monkeypatch.setattr(
        service, "get_user_by_identity_id", AsyncMock(return_value=existing)
    )
    monkeypatch.setattr(service, "get_user_by_username", AsyncMock())

    username = await service._resolve_username(
        identity_id="id-001",
        preferred_username="preferred",
        email="user@example.com",
    )

    assert username == "stable_name"


@pytest.mark.asyncio
async def test_identity_service_adds_suffix_on_username_collision(monkeypatch):
    service = IdentityService()
    monkeypatch.setattr(
        service, "get_user_by_identity_id", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        service,
        "get_user_by_username",
        AsyncMock(return_value=SimpleNamespace(id="other")),
    )

    username = await service._resolve_username(
        identity_id="id-001",
        preferred_username="teacher",
        email="teacher@example.com",
    )

    assert username.startswith("teacher-")


def test_identity_username_normalization_keeps_local_mirror_safe():
    assert normalize_username(" teacher@example.com ") == "teacher_example_com"


@pytest.mark.asyncio
async def test_auth_service_getters_delegate_to_db(monkeypatch):
    service = AuthService()
    fake_db = SimpleNamespace(
        get_user_by_email=AsyncMock(return_value=None),
        get_user_by_username=AsyncMock(return_value=None),
        get_user_by_id=AsyncMock(return_value=None),
    )
    monkeypatch.setattr("services.auth_service.db_service", fake_db)

    await service.get_user_by_email("u@test.com")
    await service.get_user_by_username("user")
    await service.get_user_by_id("id-001")

    fake_db.get_user_by_email.assert_awaited_once_with("u@test.com")
    fake_db.get_user_by_username.assert_awaited_once_with("user")
    fake_db.get_user_by_id.assert_awaited_once_with("id-001")
