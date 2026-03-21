from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routers.chat import message_flow


@pytest.mark.asyncio
async def test_build_history_payload_uses_compact_recent_query(monkeypatch):
    recent_messages = [
        SimpleNamespace(role="user", content="U1"),
        SimpleNamespace(role="assistant", content="A1"),
    ]
    get_recent = AsyncMock(return_value=recent_messages)
    monkeypatch.setattr(
        message_flow.db_service,
        "get_recent_conversation_messages",
        get_recent,
    )

    payload = await message_flow.build_history_payload("proj-1", "sess-1")

    assert payload == [
        {"role": "user", "content": "U1"},
        {"role": "assistant", "content": "A1"},
    ]
    get_recent.assert_awaited_once_with(
        project_id="proj-1",
        limit=6,
        session_id="sess-1",
        select={"role": True, "content": True},
    )
