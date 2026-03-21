from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.command_execution import (
    load_cached_command_response,
)


@pytest.mark.anyio
async def test_load_cached_command_response_returns_none_when_key_missing():
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(find_unique=AsyncMock(return_value=None))
    )

    payload = await load_cached_command_response(
        db=db,
        session_id="s-001",
        user_id="u-001",
        idempotency_key=None,
    )

    assert payload is None
    db.idempotencykey.find_unique.assert_not_awaited()


@pytest.mark.anyio
async def test_load_cached_command_response_returns_dict_payload():
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(
            find_unique=AsyncMock(return_value=SimpleNamespace(response='{"ok": true}'))
        )
    )

    payload = await load_cached_command_response(
        db=db,
        session_id="s-001",
        user_id="u-001",
        idempotency_key="idem-001",
    )

    assert payload == {"ok": True}


@pytest.mark.anyio
async def test_load_cached_command_response_ignores_invalid_json(caplog):
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(
            find_unique=AsyncMock(return_value=SimpleNamespace(response="{bad-json"))
        )
    )

    payload = await load_cached_command_response(
        db=db,
        session_id="s-001",
        user_id="u-001",
        idempotency_key="idem-001",
    )

    assert payload is None
    assert "unreadable command idempotency cache entry" in caplog.text


@pytest.mark.anyio
async def test_load_cached_command_response_ignores_non_object_payload(caplog):
    db = SimpleNamespace(
        idempotencykey=SimpleNamespace(
            find_unique=AsyncMock(return_value=SimpleNamespace(response='["bad"]'))
        )
    )

    payload = await load_cached_command_response(
        db=db,
        session_id="s-001",
        user_id="u-001",
        idempotency_key="idem-001",
    )

    assert payload is None
    assert "non-object command idempotency cache entry" in caplog.text
