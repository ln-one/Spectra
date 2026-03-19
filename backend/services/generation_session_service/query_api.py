from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from services.generation_session_service.queries import get_events as query_events
from services.generation_session_service.queries import (
    get_session_artifact_history as query_session_artifact_history,
)
from services.generation_session_service.queries import (
    get_session_runtime_state as query_session_runtime_state,
)
from services.generation_session_service.queries import (
    get_session_snapshot as query_session_snapshot,
)

if TYPE_CHECKING:
    from services.platform.state_transition_guard import StateTransitionGuard
else:
    StateTransitionGuard = Any


class SessionQueryMixin:
    _db: Any
    _guard: StateTransitionGuard

    async def get_session_snapshot(self, session_id: str, user_id: str) -> dict:
        return await query_session_snapshot(
            db=self._db,
            guard=self._guard,
            session_id=session_id,
            user_id=user_id,
            contract_version=self.CONTRACT_VERSION,
            schema_version=self.SCHEMA_VERSION,
        )

    async def _get_session_artifact_history(
        self,
        project_id: str,
        session_id: str,
    ) -> dict:
        return await query_session_artifact_history(
            db=self._db,
            project_id=project_id,
            session_id=session_id,
        )

    async def get_session_runtime_state(self, session_id: str, user_id: str) -> dict:
        return await query_session_runtime_state(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
        )

    async def get_events(
        self,
        session_id: str,
        user_id: str,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        return await query_events(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
            cursor=cursor,
            limit=limit,
        )

    async def update_outline(
        self,
        session_id: str,
        user_id: str,
        outline_data: dict,
        base_version: int,
        change_reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        return await self.execute_command(
            session_id=session_id,
            user_id=user_id,
            command={
                "command_type": "UPDATE_OUTLINE",
                "base_version": base_version,
                "outline": outline_data,
                "change_reason": change_reason,
            },
            idempotency_key=idempotency_key,
        )
