from __future__ import annotations

import json
from typing import Any, Optional

from services.generation_session_service.command_execution import (
    build_command_response,
    dispatch_created_task,
    load_and_validate_session,
    load_cached_command_response,
    save_cached_command_response,
)
from services.generation_session_service.command_handlers import dispatch_command
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

        created_task_id = await self._dispatch_command(session, command, result)
        if command_type == GenerationCommandType.REDRAFT_OUTLINE.value:
            await self._schedule_outline_draft_task(
                session_id=session.id,
                project_id=session.projectId,
                options=_build_redraft_outline_options(session, command),
                task_queue_service=task_queue_service,
            )
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


def _build_redraft_outline_options(session, command: dict) -> Optional[dict]:
    options_raw = getattr(session, "options", None)
    options: dict = {}
    if options_raw:
        try:
            parsed = json.loads(options_raw)
            if isinstance(parsed, dict):
                options = parsed
        except (TypeError, json.JSONDecodeError):
            options = {}

    instruction = str(command.get("instruction") or "").strip()
    if instruction:
        options = {
            **options,
            "outline_redraft_instruction": instruction,
        }
    return options or None
