from __future__ import annotations

from typing import Any, Optional

from services.generation_session_service.command_execution import (
    build_command_response,
    dispatch_created_task,
    load_and_validate_session,
    load_cached_command_response,
    save_cached_command_response,
)
from services.generation_session_service.command_handlers import dispatch_command
from services.platform.state_transition_guard import TransitionResult


class SessionCommandMixin:
    _db: Any
    _guard: Any
    _EXECUTION_TRIGGER_COMMANDS: set[str]

    async def execute_command(
        self,
        session_id: str,
        user_id: str,
        command: dict,
        idempotency_key: Optional[str] = None,
        task_queue_service=None,
    ) -> dict:
        cached = await load_cached_command_response(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        if cached:
            return cached

        session, command_type, result = await load_and_validate_session(
            db=self._db,
            guard=self._guard,
            execution_trigger_commands=self._EXECUTION_TRIGGER_COMMANDS,
            conflict_error_cls=self.conflict_error_cls,
            session_id=session_id,
            user_id=user_id,
            command=command,
        )

        created_task_id = await self._dispatch_command(session, command, result)
        warnings = await dispatch_created_task(
            db=self._db,
            conflict_error_cls=self.conflict_error_cls,
            session_id=session_id,
            session=session,
            created_task_id=created_task_id,
            task_queue_service=task_queue_service,
            schedule_local_execution=self._schedule_local_execution,
            mark_dispatch_failed=self._mark_dispatch_failed,
            schedule_enqueued_task_watchdog=self._schedule_enqueued_task_watchdog,
        )

        response_data = await build_command_response(
            db=self._db,
            session_id=session_id,
            command_type=command_type,
            created_task_id=created_task_id,
            result=result,
            warnings=warnings,
            contract_version=self.CONTRACT_VERSION,
            schema_version=self.SCHEMA_VERSION,
        )

        await save_cached_command_response(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            response_data=response_data,
        )

        return response_data

    async def _dispatch_command(
        self,
        session,
        command: dict,
        result: TransitionResult,
    ) -> Optional[str]:
        return await dispatch_command(
            db=self._db,
            session=session,
            command=command,
            new_state=result.to_state,
            append_event=self._append_event,
            conflict_error_cls=self.conflict_error_cls,
        )
