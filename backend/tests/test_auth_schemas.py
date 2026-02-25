"""Tests for auth schemas (Batch C1)."""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from schemas.auth import (
    AuthData,
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UserInfo,
    UserInfoData,
    UserInfoResponse,
)


def test_register_request_valid_payload():
    req = RegisterRequest(
        email="teacher@example.com",
        password="StrongPwd123",
        username="teacher_01",
        fullName="Teacher One",
    )

    assert req.email == "teacher@example.com"
    assert req.username == "teacher_01"


def test_register_request_rejects_short_password():
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="teacher@example.com",
            password="short",
            username="teacher_01",
        )


def test_register_request_rejects_invalid_username():
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="teacher@example.com",
            password="StrongPwd123",
            username="bad name",
        )


def test_register_request_rejects_invalid_email():
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="invalid-email",
            password="StrongPwd123",
            username="teacher_01",
        )


def test_login_request_valid_payload():
    req = LoginRequest(email="teacher@example.com", password="StrongPwd123")

    assert req.email == "teacher@example.com"


def test_userinfo_from_attributes():
    obj = SimpleNamespace(
        id="u-001",
        email="teacher@example.com",
        username="teacher_01",
        fullName="Teacher One",
        createdAt=datetime.now(timezone.utc),
    )

    user = UserInfo.model_validate(obj)

    assert user.id == "u-001"
    assert user.username == "teacher_01"


def test_auth_response_schema_shape():
    now = datetime.now(timezone.utc)
    user = UserInfo(
        id="u-001",
        email="teacher@example.com",
        username="teacher_01",
        fullName="Teacher One",
        createdAt=now,
    )

    response = AuthResponse(data=AuthData(access_token="token", user=user))

    assert response.success is True
    assert response.data.access_token == "token"


def test_userinfo_response_schema_shape():
    now = datetime.now(timezone.utc)
    user = UserInfo(
        id="u-001",
        email="teacher@example.com",
        username="teacher_01",
        fullName="Teacher One",
        createdAt=now,
    )

    response = UserInfoResponse(data=UserInfoData(user=user))

    assert response.success is True
    assert response.data.user.id == "u-001"
