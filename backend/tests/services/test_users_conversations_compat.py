from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.database.users_conversations import UserConversationMixin


class _ConversationService(UserConversationMixin):
    def __init__(self, db):
        self.db = db


@pytest.mark.asyncio
async def test_get_recent_conversation_messages_falls_back_when_select_not_supported():
    calls = []

    async def _find_many(**kwargs):
        calls.append(kwargs)
        if "select" in kwargs:
            raise TypeError(
                "ConversationActions.find_many() got an unexpected keyword argument 'select'"
            )
        return [SimpleNamespace(role="user", content="u1")]

    service = _ConversationService(
        db=SimpleNamespace(
            conversation=SimpleNamespace(find_many=AsyncMock(side_effect=_find_many))
        )
    )

    messages = await service.get_recent_conversation_messages(
        project_id="p-001",
        limit=6,
        session_id="s-001",
        select={"role": True, "content": True},
    )

    assert len(messages) == 1
    assert messages[0].role == "user"
    assert len(calls) == 2
    assert "select" in calls[0]
    assert "select" not in calls[1]
