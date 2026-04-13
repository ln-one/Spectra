from __future__ import annotations

from typing import Any, Optional

from services.generation_session_service.event_store import append_event


class SessionTaskRuntimeMixin:
    _db: Any
    SCHEMA_VERSION: int

    async def _append_event(
        self,
        session_id: str,
        event_type: str,
        state: str,
        state_reason: Optional[str] = None,
        progress: Optional[int] = None,
        payload: Optional[dict] = None,
    ) -> None:
        await append_event(
            db=self._db,
            schema_version=self.SCHEMA_VERSION,
            session_id=session_id,
            event_type=event_type,
            state=state,
            state_reason=state_reason,
            progress=progress,
            payload=payload,
        )
