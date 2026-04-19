from __future__ import annotations

from typing import Any, Optional

from services.generation_session_service.command_execution import (
    load_and_validate_session,
    load_cached_command_response,
    save_cached_command_response,
)
from services.generation_session_service.command_handlers import dispatch_command
from services.generation_session_service.command_response import (
    build_command_response,
)
from services.generation_session_service.session_history import (
    request_run_title_generation,
)
from services.platform.state_transition_guard import (
    GenerationCommandType,
    TransitionResult,
)


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

        dispatch_result = await self._dispatch_command(session, command, result)
        run_data = (
            dispatch_result.get("run") if isinstance(dispatch_result, dict) else None
        )

        response_data = await build_command_response(
            db=self._db,
            session_id=session_id,
            command_type=command_type,
            run_data=run_data,
            result=result,
            warnings=[],
            contract_version=self.CONTRACT_VERSION,
            schema_version=self.SCHEMA_VERSION,
        )

        if run_data and command_type != GenerationCommandType.SET_SESSION_TITLE.value:
            await request_run_title_generation(
                db=self._db,
                run_id=run_data["run_id"],
                tool_type=run_data["tool_type"],
                snapshot=command,
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
    ) -> Optional[dict]:
        return await dispatch_command(
            db=self._db,
            session=session,
            command=command,
            new_state=result.to_state,
            append_event=self._append_event,
            conflict_error_cls=self.conflict_error_cls,
        )
