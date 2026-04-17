from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.database.users_conversations import UserConversationMixin


class _ConversationService(UserConversationMixin):
    def __init__(self, db):
        self.db = db


@pytest.mark.asyncio
async def test_get_recent_conversation_messages_projects_fields_without_select_query():
    find_many = AsyncMock(return_value=[SimpleNamespace(role="user", content="u1")])
    service = _ConversationService(
        db=SimpleNamespace(conversation=SimpleNamespace(find_many=find_many))
    )

    messages = await service.get_recent_conversation_messages(
        project_id="p-001",
        limit=6,
        session_id="s-001",
        select={"role": True, "content": True},
    )

    assert len(messages) == 1
    assert messages[0].role == "user"
    find_many.assert_awaited_once_with(
        where={"projectId": "p-001", "sessionId": "s-001"},
        take=6,
        order={"createdAt": "desc"},
    )
