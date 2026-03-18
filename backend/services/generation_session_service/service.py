"""
GenerationSessionService - 会话化生成主链路服务

实现 C6 Gamma 流：创建会话、状态管理、大纲版本控制、事件追加、结果回写。
所有状态写操作经过 StateTransitionGuard 校验。

契约参考：docs/openapi.yaml SessionStatePayload / GenerationSession
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Optional

from services.generation_session_service.command_execution import (
    build_command_response,
    dispatch_created_task,
    load_and_validate_session,
    load_cached_command_response,
    save_cached_command_response,
)
from services.generation_session_service.command_handlers import dispatch_command
from services.generation_session_service.event_store import append_event
from services.generation_session_service.helpers import (
    _build_outline_requirements,
    _default_capabilities,
    _extract_outline_style,
)
from services.generation_session_service.lifecycle import create_session
from services.generation_session_service.outline_draft import (
    execute_outline_draft_local,
    schedule_outline_draft_task,
    schedule_outline_draft_watchdog,
)
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
from services.generation_session_service.task_dispatch import (
    mark_dispatch_failed,
    schedule_enqueued_task_watchdog,
    schedule_local_execution,
)
from services.state_transition_guard import (
    StateTransitionGuard,
    TransitionResult,
    state_transition_guard,
)

if TYPE_CHECKING:
    from prisma import Prisma
else:
    Prisma = Any

logger = logging.getLogger(__name__)

CONTRACT_VERSION = "2026-03"
SCHEMA_VERSION = 1
__all__ = [
    "ConflictError",
    "GenerationSessionService",
    "_build_outline_requirements",
    "_default_capabilities",
    "_extract_outline_style",
]
_EXECUTION_TRIGGER_COMMANDS = {
    "CONFIRM_OUTLINE",
    "RESUME_SESSION",
    "REGENERATE_SLIDE",
}


class GenerationSessionService:
    """
    会话化生成主链路服务（C6）。

    使用说明：注入 Prisma 客户端实例，所有方法均为 async。
    """

    def __init__(
        self, db: Prisma, guard: StateTransitionGuard = state_transition_guard
    ):
        self._db = db
        self._guard = guard

    # ----------------------------------------------------------
    # 1. 创建会话
    # ----------------------------------------------------------

    async def create_session(
        self,
        project_id: str,
        user_id: str,
        output_type: str,
        options: Optional[dict] = None,
        client_session_id: Optional[str] = None,
        task_queue_service=None,
    ) -> dict:
        """
        创建新的生成会话，快速返回（异步大纲草拟）。

        Returns:
            SessionRef 字典（对齐 OpenAPI CreateGenerationSessionResponse.data.session）
        """
        session_ref = await create_session(
            db=self._db,
            project_id=project_id,
            user_id=user_id,
            output_type=output_type,
            options=options,
            client_session_id=client_session_id,
            task_queue_service=task_queue_service,
            contract_version=CONTRACT_VERSION,
            schema_version=SCHEMA_VERSION,
            append_event=self._append_event,
            schedule_outline_draft_task=self._schedule_outline_draft_task,
        )
        logger.info("Session created for project %s", project_id)
        return session_ref

    # ----------------------------------------------------------
    # 2. 查询会话快照
    # ----------------------------------------------------------

    async def get_session_snapshot(self, session_id: str, user_id: str) -> dict:
        """
        返回完整 SessionStatePayload。

        Raises:
            ValueError: 会话不存在
            PermissionError: 无权访问
        """
        return await query_session_snapshot(
            db=self._db,
            guard=self._guard,
            session_id=session_id,
            user_id=user_id,
            contract_version=CONTRACT_VERSION,
            schema_version=SCHEMA_VERSION,
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
        """
        返回 SSE 轮询所需的轻量会话状态，避免每秒加载 outline/tasks。
        """
        return await query_session_runtime_state(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
        )

    # ----------------------------------------------------------
    # 3. 执行命令（唯一写操作入口）
    # ----------------------------------------------------------

    async def execute_command(
        self,
        session_id: str,
        user_id: str,
        command: dict,
        idempotency_key: Optional[str] = None,
        task_queue_service=None,
    ) -> dict:
        """
        执行会话命令，经过 StateTransitionGuard 校验。

        Returns:
            GenerationSessionCommandResponse.data 字典

        Raises:
            ValueError: 会话不存在
            PermissionError: 无权访问
            ConflictError: 状态不允许或版本冲突（由调用层转为 409）
        """
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
            execution_trigger_commands=_EXECUTION_TRIGGER_COMMANDS,
            conflict_error_cls=ConflictError,
            session_id=session_id,
            user_id=user_id,
            command=command,
        )

        # 执行具体命令逻辑，CONFIRM_OUTLINE 时返回已创建的 task_id
        created_task_id = await self._dispatch_command(session, command, result)
        warnings = await dispatch_created_task(
            db=self._db,
            conflict_error_cls=ConflictError,
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
            contract_version=CONTRACT_VERSION,
            schema_version=SCHEMA_VERSION,
        )

        await save_cached_command_response(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            response_data=response_data,
        )

        return response_data

    # ----------------------------------------------------------
    # 4. 事件流查询（SSE 增量 / 短轮询）
    # ----------------------------------------------------------

    async def get_events(
        self,
        session_id: str,
        user_id: str,
        cursor: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict]:
        """
        返回 cursor 之后的事件列表（用于短轮询或 SSE 历史补齐）。
        """
        return await query_events(
            db=self._db,
            session_id=session_id,
            user_id=user_id,
            cursor=cursor,
            limit=limit,
        )

    # ----------------------------------------------------------
    # 5. 更新大纲（UPDATE_OUTLINE 便捷版）
    # ----------------------------------------------------------

    async def update_outline(
        self,
        session_id: str,
        user_id: str,
        outline_data: dict,
        base_version: int,
        change_reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        """
        兼容别名端点 PUT /outline，内部转发给 execute_command。
        """
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

    # ----------------------------------------------------------
    # 内部辅助
    # ----------------------------------------------------------

    async def _dispatch_command(
        self,
        session,
        command: dict,
        result: TransitionResult,
    ) -> Optional[str]:
        """根据 command_type 执行对应的业务逻辑并更新数据库。

        Returns:
            task_id (str) if a GenerationTask was created (CONFIRM_OUTLINE), else None.
        """
        return await dispatch_command(
            db=self._db,
            session=session,
            command=command,
            new_state=result.to_state,
            append_event=self._append_event,
            conflict_error_cls=ConflictError,
        )

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
        from services import generation_session_service as generation_session_module

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
            schema_version=SCHEMA_VERSION,
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
            schedule_local_execution=self._schedule_local_execution,
            mark_dispatch_failed=self._mark_dispatch_failed,
        )

    async def _schedule_local_execution(
        self,
        session_id: str,
        task_id: str,
        project_id: str,
        task_type: str,
        template_config: Optional[dict],
        fallback_reason: str,
        enqueue_error: Optional[str] = None,
    ) -> bool:
        return await schedule_local_execution(
            session_id=session_id,
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
            fallback_reason=fallback_reason,
            append_event=self._append_event,
            enqueue_error=enqueue_error,
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


# ============================================================
# 并发冲突异常
# ============================================================


class ConflictError(Exception):
    """会话状态或版本冲突，对应 HTTP 409。"""

    pass
