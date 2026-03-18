"""
GenerationSessionService - 会话化生成主链路服务

实现 C6 Gamma 流：创建会话、状态管理、大纲版本控制、事件追加、结果回写。
所有状态写操作经过 StateTransitionGuard 校验。

契约参考：docs/openapi.yaml SessionStatePayload / GenerationSession
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import TYPE_CHECKING, Any, Optional

from services.generation_session_service.command_handlers import dispatch_command
from services.generation_session_service.helpers import (
    _build_outline_requirements,
    _default_capabilities,
    _extract_outline_style,
    _extract_template_config,
    _is_queue_worker_available,
    _normalize_task_type,
    _to_session_ref,
)
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
from services.state_transition_guard import (
    StateTransitionGuard,
    TransitionResult,
    state_transition_guard,
)
from services.task_recovery import TaskRecoveryService

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
        session = await self._db.generationsession.create(
            data={
                "projectId": project_id,
                "userId": user_id,
                "outputType": output_type,
                "options": json.dumps(options) if options else None,
                "clientSessionId": client_session_id,
                "state": "DRAFTING_OUTLINE",
                "renderVersion": 0,
                "currentOutlineVersion": 0,
                "resumable": True,
            }
        )

        # 写入初始事件
        await self._append_event(
            session_id=session.id,
            event_type="state.changed",
            state="DRAFTING_OUTLINE",
            progress=0,
            payload={"reason": "session_created"},
        )

        # 触发后台大纲草拟任务（不等待完成）
        await self._schedule_outline_draft_task(
            session_id=session.id,
            project_id=project_id,
            options=options,
            task_queue_service=task_queue_service,
        )

        logger.info("Session created: %s for project %s", session.id, project_id)
        return _to_session_ref(session, CONTRACT_VERSION, SCHEMA_VERSION)

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
        # 幂等检查（key 含 user_id + session_id 防跨用户/跨会话溢用）
        if idempotency_key:
            cached = await self._db.idempotencykey.find_unique(
                where={"key": f"cmd:{user_id}:{session_id}:{idempotency_key}"}
            )
            if cached:
                return json.loads(cached.response)

        session = await self._db.generationsession.find_unique(where={"id": session_id})
        if session is None:
            raise ValueError(f"Session not found: {session_id}")
        if session.userId != user_id:
            raise PermissionError("无权访问该会话")

        command_type = command.get("command_type", "")

        # C1 幂等防重：同一 session 存在执行中任务时拒绝重复执行触发型命令。
        if command_type in _EXECUTION_TRIGGER_COMMANDS:
            recovery_service = TaskRecoveryService(self._db)
            if await recovery_service.is_session_already_running(session_id):
                raise ConflictError(
                    "当前会话已有执行中的任务，请等待当前任务完成后重试"
                )

        result = self._guard.validate(session.state, command_type)

        if not result.allowed:
            raise ConflictError(result.reject_reason or "状态转换不允许")

        command_id = str(uuid.uuid4())

        # 执行具体命令逻辑，CONFIRM_OUTLINE 时返回已创建的 task_id
        created_task_id = await self._dispatch_command(session, command, result)
        warnings: list[str] = []

        # CONFIRM_OUTLINE 触发入队；队列不可用时降级为本地异步执行，避免 pending 卡死
        if created_task_id:
            task_type = _normalize_task_type(session.outputType, ConflictError)
            template_config = _extract_template_config(session.options)
            worker_available = _is_queue_worker_available(task_queue_service)

            if task_queue_service is None or not worker_available:
                fallback_reason = (
                    "task_queue_unavailable_fallback_local_execution"
                    if task_queue_service is None
                    else "task_queue_no_worker_fallback_local_execution"
                )
                scheduled = await self._schedule_local_execution(
                    session_id=session_id,
                    task_id=created_task_id,
                    project_id=session.projectId,
                    task_type=task_type,
                    template_config=template_config,
                    fallback_reason=fallback_reason,
                )
                if scheduled:
                    warnings.append(fallback_reason)
                else:
                    await self._mark_dispatch_failed(
                        session_id=session_id,
                        task_id=created_task_id,
                        error_message=(
                            "Task queue unavailable and local"
                            " fallback scheduling failed"
                        ),
                    )
                    raise ConflictError("任务分发失败，请稍后重试")
            else:
                try:
                    job = task_queue_service.enqueue_generation_task(
                        task_id=created_task_id,
                        project_id=session.projectId,
                        task_type=task_type,
                        template_config=template_config,
                        priority="default",
                    )
                    # 将 RQ Job ID 写回 GenerationTask
                    await self._db.generationtask.update(
                        where={"id": created_task_id},
                        data={"rqJobId": job.id},
                    )
                    logger.info(
                        "Session task enqueued: session=%s task=%s rq_job=%s",
                        session_id,
                        created_task_id,
                        job.id,
                    )
                    self._schedule_enqueued_task_watchdog(
                        session_id=session_id,
                        task_id=created_task_id,
                        project_id=session.projectId,
                        task_type=task_type,
                        template_config=template_config,
                        rq_job_id=job.id,
                        task_queue_service=task_queue_service,
                    )
                except Exception as enqueue_err:
                    logger.warning(
                        "Failed to enqueue session task,"
                        " fallback to local async execution: %s",
                        enqueue_err,
                    )
                    scheduled = await self._schedule_local_execution(
                        session_id=session_id,
                        task_id=created_task_id,
                        project_id=session.projectId,
                        task_type=task_type,
                        template_config=template_config,
                        fallback_reason="task_enqueue_failed_fallback_local_execution",
                        enqueue_error=str(enqueue_err),
                    )
                    if scheduled:
                        warnings.append("task_enqueue_failed_fallback_local_execution")
                    else:
                        await self._mark_dispatch_failed(
                            session_id=session_id,
                            task_id=created_task_id,
                            error_message=(
                                "Task enqueue failed and local"
                                " fallback scheduling failed: "
                                f"{type(enqueue_err).__name__}: {enqueue_err}"
                            ),
                        )
                        raise ConflictError("任务分发失败，请稍后重试")

        transition = {
            "command_type": command_type,
            "from_state": result.from_state,
            "to_state": result.to_state,
            "validated_by": result.validated_by,
        }

        # 查询更新后的会话
        updated_session = await self._db.generationsession.find_unique(
            where={"id": session_id}
        )

        response_data = {
            "command_id": command_id,
            "accepted": True,
            "task_id": created_task_id,
            "transition": transition,
            "session": _to_session_ref(
                updated_session,
                CONTRACT_VERSION,
                SCHEMA_VERSION,
                task_id=created_task_id,
            ),
            "warnings": warnings,
        }

        # 缓存幂等响应（key 含 user_id + session_id 防跨用户/跨会话溢用）
        if idempotency_key:
            try:
                await self._db.idempotencykey.create(
                    data={
                        "key": f"cmd:{user_id}:{session_id}:{idempotency_key}",
                        "response": json.dumps(response_data),
                    }
                )
            except Exception:
                pass  # 并发重复写入时忽略

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
        """追加不可变事件记录并更新 lastCursor。"""
        cursor = str(uuid.uuid4())
        await self._db.sessionevent.create(
            data={
                "sessionId": session_id,
                "eventType": event_type,
                "state": state,
                "stateReason": state_reason,
                "progress": progress,
                "cursor": cursor,
                "payload": json.dumps(payload) if payload else None,
                "schemaVersion": SCHEMA_VERSION,
            }
        )
        # 同步更新会话的 lastCursor
        await self._db.generationsession.update(
            where={"id": session_id},
            data={"lastCursor": cursor},
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
        async def _watch() -> None:
            await asyncio.sleep(2)
            try:
                job_status = await asyncio.to_thread(
                    task_queue_service.get_job_status,
                    rq_job_id,
                )
            except Exception as exc:
                logger.warning(
                    "Task watchdog failed to read RQ status: task=%s job=%s error=%s",
                    task_id,
                    rq_job_id,
                    exc,
                )
                return

            if not job_status or job_status.get("status") != "failed":
                return

            task = await self._db.generationtask.find_unique(where={"id": task_id})
            if task is None or task.status != "pending":
                return

            exc_info = job_status.get("exc_info")
            enqueue_error = exc_info if isinstance(exc_info, str) else str(exc_info)
            scheduled = await self._schedule_local_execution(
                session_id=session_id,
                task_id=task_id,
                project_id=project_id,
                task_type=task_type,
                template_config=template_config,
                fallback_reason="rq_job_failed_fallback_local_execution",
                enqueue_error=(enqueue_error or "")[:400],
            )
            if not scheduled:
                await self._mark_dispatch_failed(
                    session_id=session_id,
                    task_id=task_id,
                    error_message="RQ job failed and local fallback scheduling failed",
                )

        asyncio.create_task(_watch())

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
        try:
            from services.task_executor import execute_generation_task

            asyncio.create_task(
                execute_generation_task(
                    task_id=task_id,
                    project_id=project_id,
                    task_type=task_type,
                    template_config=template_config,
                )
            )
            logger.warning(
                "Session task fallback to local async execution:"
                " session=%s task=%s reason=%s",
                session_id,
                task_id,
                fallback_reason,
            )
            try:
                await self._append_event(
                    session_id=session_id,
                    event_type="state.changed",
                    state="GENERATING_CONTENT",
                    state_reason=fallback_reason,
                    payload={
                        "task_id": task_id,
                        "dispatch": "local_async",
                        "reason": fallback_reason,
                        "enqueue_error": enqueue_error,
                    },
                )
            except Exception as event_err:
                logger.warning(
                    "Failed to append fallback dispatch event: session=%s error=%s",
                    session_id,
                    event_err,
                )
            return True
        except Exception as local_err:
            logger.error(
                "Failed to schedule local fallback execution:"
                " session=%s task=%s error=%s",
                session_id,
                task_id,
                local_err,
            )
            return False

    async def _mark_dispatch_failed(
        self,
        session_id: str,
        task_id: str,
        error_message: str,
    ) -> None:
        await self._db.generationtask.update(
            where={"id": task_id},
            data={"status": "failed", "errorMessage": error_message},
        )
        await self._db.generationsession.update(
            where={"id": session_id},
            data={
                "state": "FAILED",
                "errorCode": "TASK_DISPATCH_FAILED",
                "errorMessage": error_message,
                "errorRetryable": True,
                "resumable": True,
            },
        )
        await self._append_event(
            session_id=session_id,
            event_type="state.changed",
            state="FAILED",
            state_reason="task_dispatch_failed",
            payload={"task_id": task_id, "error": error_message},
        )


# ============================================================
# 并发冲突异常
# ============================================================


class ConflictError(Exception):
    """会话状态或版本冲突，对应 HTTP 409。"""

    pass
