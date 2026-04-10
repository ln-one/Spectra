from __future__ import annotations

from importlib import import_module
from typing import Any, Optional

from services.generation_session_service.event_store import append_event
from services.generation_session_service.outline_draft import (
    execute_outline_draft_local,
    schedule_outline_draft_task,
    schedule_outline_draft_watchdog,
)
from services.generation_session_service.task_dispatch import (
    mark_dispatch_failed,
    schedule_enqueued_task_watchdog,
)


class SessionTaskRuntimeMixin:
    _db: Any
    SCHEMA_VERSION: int

    async def _schedule_outline_draft_task(
        self,
        session_id: str,
        project_id: str,
        options: Optional[dict],
        task_queue_service,
    ) -> None:
        await schedule_outline_draft_task(
            db=self._db,
            session_id=session_id,
            project_id=project_id,
            options=options,
            task_queue_service=task_queue_service,
            append_event=self._append_event,
            execute_outline_draft_local=self._execute_outline_draft_local,
        )

    def _schedule_outline_draft_watchdog(
        self,
        session_id: str,
        project_id: str,
        options: Optional[dict],
        rq_job_id: str,
        task_queue_service,
    ) -> None:
        schedule_outline_draft_watchdog(
            db=self._db,
            session_id=session_id,
            project_id=project_id,
            options=options,
            rq_job_id=rq_job_id,
            task_queue_service=task_queue_service,
            execute_outline_draft_local=self._execute_outline_draft_local,
        )

    async def _execute_outline_draft_local(
        self,
        session_id: str,
        project_id: str,
        options: Optional[dict],
        trace_id: Optional[str] = None,
    ) -> None:
        generation_session_module = import_module("services.generation_session_service")

        await execute_outline_draft_local(
            db=self._db,
            session_id=session_id,
            project_id=project_id,
            options=options,
            append_event=self._append_event,
            ai_service_obj=generation_session_module.ai_service,
            trace_id=trace_id,
        )

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

    def _schedule_enqueued_task_watchdog(
        self,
        session_id: str,
        task_id: str,
        project_id: str,
        task_type: str,
        template_config: Optional[dict],
        rq_job_id: str,
        task_queue_service,
    ) -> None:
        schedule_enqueued_task_watchdog(
            db=self._db,
            session_id=session_id,
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
            rq_job_id=rq_job_id,
            task_queue_service=task_queue_service,
            mark_dispatch_failed=self._mark_dispatch_failed,
        )

    async def _mark_dispatch_failed(
        self,
        session_id: str,
        task_id: str,
        error_message: str,
    ) -> None:
        await mark_dispatch_failed(
            db=self._db,
            session_id=session_id,
            task_id=task_id,
            error_message=error_message,
            append_event=self._append_event,
        )
