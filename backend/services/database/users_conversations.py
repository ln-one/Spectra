import json
from types import SimpleNamespace
from typing import Optional


class UserConversationMixin:
    @staticmethod
    def _project_message_fields(record, select: Optional[dict] = None):
        if not select:
            return record

        projected: dict = {}
        for field_name, enabled in select.items():
            if not enabled:
                continue
            if isinstance(record, dict):
                projected[field_name] = record.get(field_name)
            else:
                projected[field_name] = getattr(record, field_name, None)
        return SimpleNamespace(**projected)

    async def create_user(
        self,
        email: str,
        password_hash: str,
        username: str,
        full_name: Optional[str] = None,
    ):
        return await self.db.user.create(
            data={
                "email": email,
                "password": password_hash,
                "username": username,
                "fullName": full_name,
            }
        )

    async def get_user_by_email(self, email: str):
        return await self.db.user.find_unique(where={"email": email})

    async def get_user_by_username(self, username: str):
        return await self.db.user.find_unique(where={"username": username})

    async def get_user_by_id(self, user_id: str):
        return await self.db.user.find_unique(where={"id": user_id})

    async def create_conversation_message(
        self,
        project_id: str,
        role: str,
        content: str,
        metadata: Optional[dict] = None,
        session_id: Optional[str] = None,
    ):
        data: dict = {
            "projectId": project_id,
            "role": role,
            "content": content,
            "metadata": json.dumps(metadata) if metadata else None,
        }
        if session_id:
            data["sessionId"] = session_id
        return await self.db.conversation.create(data=data)

    async def get_conversation_messages(
        self,
        project_id: str,
        page: int,
        limit: int,
        session_id: Optional[str] = None,
    ):
        skip = (page - 1) * limit
        where: dict = {"projectId": project_id}
        if session_id:
            where["sessionId"] = session_id
        return await self.db.conversation.find_many(
            where=where,
            skip=skip,
            take=limit,
            order={"createdAt": "asc"},
        )

    async def get_recent_conversation_messages(
        self,
        project_id: str,
        limit: int = 10,
        session_id: Optional[str] = None,
        select: Optional[dict] = None,
    ):
        where: dict = {"projectId": project_id}
        if session_id:
            where["sessionId"] = session_id
        query: dict = {
            "where": where,
            "take": limit,
            "order": {"createdAt": "desc"},
        }
        messages = await self.db.conversation.find_many(
            where=query["where"],
            take=query["take"],
            order=query["order"],
        )
        projected = [
            self._project_message_fields(message, select=select) for message in messages
        ]
        return list(reversed(projected))

    async def get_messages(self, project_id: str, limit: int = 10):
        return await self.get_recent_conversation_messages(
            project_id=project_id, limit=limit
        )

    async def count_conversation_messages(
        self,
        project_id: str,
        session_id: Optional[str] = None,
    ) -> int:
        where: dict = {"projectId": project_id}
        if session_id:
            where["sessionId"] = session_id
        return await self.db.conversation.count(where=where)

    async def get_conversations_paginated(
        self,
        project_id: str,
        page: int = 1,
        limit: int = 20,
        session_id: Optional[str] = None,
    ):
        messages = await self.get_conversation_messages(
            project_id=project_id,
            page=page,
            limit=limit,
            session_id=session_id,
        )
        total = await self.count_conversation_messages(
            project_id=project_id,
            session_id=session_id,
        )
        return messages, total
