from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.access import get_owned_session


@pytest.mark.anyio
async def test_get_owned_session_returns_full_model_without_select():
    session = SimpleNamespace(id="s-001", userId="u-001", state="SUCCESS")
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session))
    )

    result = await get_owned_session(
        db=db,
        session_id="s-001",
        user_id="u-001",
    )

    assert result is session
    assert db.generationsession.find_unique.await_args.kwargs == {
        "where": {"id": "s-001"}
    }


@pytest.mark.anyio
async def test_get_owned_session_projects_selected_fields_in_python():
    updated_at = datetime.now(timezone.utc)
    session = SimpleNamespace(
        id="s-001",
        userId="u-001",
        state="RENDERING",
        lastCursor="c-001",
        updatedAt=updated_at,
        projectId="p-001",
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session))
    )

    result = await get_owned_session(
        db=db,
        session_id="s-001",
        user_id="u-001",
        select={
            "userId": True,
            "state": True,
            "lastCursor": True,
            "updatedAt": True,
        },
    )

    assert isinstance(result, dict)
    assert result["state"] == "RENDERING"
    assert result.state == "RENDERING"
    assert result.lastCursor == "c-001"
    assert result.updatedAt == updated_at
    assert "projectId" not in result
    assert db.generationsession.find_unique.await_args.kwargs == {
        "where": {"id": "s-001"}
    }


@pytest.mark.anyio
async def test_get_owned_session_still_enforces_ownership_with_projection():
    session = SimpleNamespace(id="s-001", userId="u-other", state="SUCCESS")
    db = SimpleNamespace(
        generationsession=SimpleNamespace(find_unique=AsyncMock(return_value=session))
    )

    with pytest.raises(PermissionError):
        await get_owned_session(
            db=db,
            session_id="s-001",
            user_id="u-001",
            select={"state": True},
        )
