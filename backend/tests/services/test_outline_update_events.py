from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.outline_command_handlers import (
    handle_update_outline,
)


@pytest.mark.anyio
async def test_handle_update_outline_appends_run_id_in_outline_updated_event(
    monkeypatch,
):
    session = SimpleNamespace(id="sess-1", currentOutlineVersion=1)
    db = SimpleNamespace(generationsession=SimpleNamespace(update=AsyncMock()))
    append_event = AsyncMock()

    monkeypatch.setattr(
        "services.generation_session_service.outline_command_handlers.get_effective_outline_version",
        AsyncMock(return_value=1),
    )
    monkeypatch.setattr(
        "services.generation_session_service.outline_command_handlers.persist_outline_version",
        AsyncMock(return_value=None),
    )

    await handle_update_outline(
        db=db,
        session=session,
        command={
            "base_version": 1,
            "outline": {"version": 1, "nodes": [], "summary": ""},
            "run_id": "run-123",
        },
        new_state="AWAITING_OUTLINE_CONFIRM",
        append_event=append_event,
        conflict_error_cls=RuntimeError,
    )

    assert append_event.await_args.kwargs["payload"]["run_id"] == "run-123"
