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
import os
import uuid
from typing import Optional

from prisma import Prisma
from services.state_transition_guard import (
    StateTransitionGuard,
    TransitionResult,
    state_transition_guard,
)
from services.task_recovery import TaskRecoveryService
from services.ai import ai_service

logger = logging.getLogger(__name__)

CONTRACT_VERSION = "2026-03"
SCHEMA_VERSION = 1
_EXECUTION_TRIGGER_COMMANDS = {
    "CONFIRM_OUTLINE",
    "RESUME_SESSION",
    "REGENERATE_SLIDE",
}
_SESSION_TO_TASK_TYPE = {
    "ppt": "pptx",
    "word": "docx",
    "both": "both",
    # backward compatibility
    "pptx": "pptx",
    "docx": "docx",
}


def _build_outline_requirements(
    project,
    options: Optional[dict],
) -> str:
    """Build outline requirements text from project info + generation options."""
    parts = []
    if project:
        if getattr(project, "name", None):
            parts.append(f"项目名称：{project.name}")
        if getattr(project, "description", None):
            parts.append(f"项目描述：{project.description}")

    if options:
        if options.get("system_prompt_tone"):
            parts.append(f"用户需求：{options['system_prompt_tone']}")
        if options.get("pages"):
            parts.append(f"目标页数：{options['pages']}")
        if options.get("audience"):
            parts.append(f"目标受众：{options['audience']}")
        if options.get("target_duration_minutes"):
            parts.append(f"目标时长：{options['target_duration_minutes']} 分钟")

    return "\n".join(parts).strip() or "生成课件大纲"


def _courseware_outline_to_document(outline, target_pages: Optional[int] = None) -> dict:
    """Map CoursewareOutline to OutlineDocument schema."""
    nodes = []
    order = 1
    for section in outline.sections:
        count = section.slide_count or 1
        for idx in range(count):
            title = section.title if count == 1 else f"{section.title}（{idx + 1}）"
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": title,
                    "key_points": list(section.key_points or []),
                    "estimated_minutes": None,
                }
            )
            order += 1

    # Optional padding to roughly match target pages
    if target_pages and len(nodes) < target_pages:
        while len(nodes) < target_pages:
            nodes.append(
                {
                    "id": str(uuid.uuid4()),
                    "order": order,
                    "title": f"补充内容 {order}",
                    "key_points": [],
                    "estimated_minutes": None,
                }
            )
            order += 1

    return {
        "version": 1,
        "nodes": nodes,
        "summary": getattr(outline, "summary", None),
    }


# ============================================================
# 内部辅助：能力声明（集成 capability_health）
# ============================================================


def _default_capabilities() -> list[dict]:
    """返回能力声明列表，集成真实健康检查。"""
    from services.capability_health import get_all_capabilities_health

    # 获取三能力的健康状态
    health_status = get_all_capabilities_health()

    doc_parser_health = health_status.get("document_parser")
    video_health = health_status.get("video_understanding")
    speech_health = health_status.get("speech_recognition")

    llm_provider = os.getenv("DEFAULT_MODEL", "qwen3.5-plus")
    llm_provider = llm_provider.replace("dashscope/", "")

    return [
        {
            "name": "outline_generation",
            "status": "available",
            "providers": [llm_provider],
            "default_provider": llm_provider,
            "fallback_chain": [],
            "operations": ["draft", "redraft", "confirm"],
            "status_message": None,
        },
        {
            "name": "document_parser",
            "status": (
                doc_parser_health.status.value if doc_parser_health else "unavailable"
            ),
            "providers": [doc_parser_health.provider] if doc_parser_health else [],
            "default_provider": (
                doc_parser_health.provider if doc_parser_health else None
            ),
            "fallback_chain": (
                [doc_parser_health.fallback_target]
                if (
                    doc_parser_health
                    and doc_parser_health.fallback_used
                    and doc_parser_health.fallback_target
                )
                else []
            ),
            "operations": ["parse"],
            "status_message": (
                doc_parser_health.user_message if doc_parser_health else None
            ),
        },
        {
            "name": "video_understanding",
            "status": video_health.status.value if video_health else "unavailable",
            "providers": [video_health.provider] if video_health else [],
            "default_provider": video_health.provider if video_health else None,
            "fallback_chain": (
                [video_health.fallback_target]
                if (
                    video_health
                    and video_health.fallback_used
                    and video_health.fallback_target
                )
                else []
            ),
            "operations": ["understand"],
            "status_message": video_health.user_message if video_health else None,
        },
        {
            "name": "speech_recognition",
            "status": speech_health.status.value if speech_health else "unavailable",
            "providers": [speech_health.provider] if speech_health else [],
            "default_provider": speech_health.provider if speech_health else None,
            "fallback_chain": (
                [speech_health.fallback_target]
                if (
                    speech_health
                    and speech_health.fallback_used
                    and speech_health.fallback_target
                )
                else []
            ),
            "operations": ["transcribe"],
            "status_message": speech_health.user_message if speech_health else None,
        },
        {
            "name": "slide_regeneration",
            "status": "available",
            "providers": [llm_provider],
            "default_provider": llm_provider,
            "fallback_chain": [],
            "operations": ["regenerate"],
            "status_message": None,
        },
        {
            "name": "event_stream",
            "status": "available",
            "providers": ["sse"],
            "default_provider": "sse",
            "fallback_chain": ["polling"],
            "operations": ["subscribe"],
            "status_message": None,
        },
    ]


# ============================================================
# Service 主类
# ============================================================


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
    ) -> dict:
        """
        创建新的生成会话，初始状态 IDLE。

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
                "currentOutlineVersion": 1,
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

        # 生成初始大纲（同步生成，失败时走 fallback）
        outline_doc = None
        try:
            project = await self._db.project.find_unique(where={"id": project_id})
            requirement_text = _build_outline_requirements(project, options)
            template_style = (
                (options or {}).get("template") or "default"
            )
            outline = await ai_service.generate_outline(
                project_id=project_id,
                user_requirements=requirement_text,
                template_style=template_style,
            )
            outline_doc = _courseware_outline_to_document(
                outline,
                target_pages=(options or {}).get("pages"),
            )
        except Exception as outline_exc:
            logger.warning(
                "Failed to draft outline, fallback to empty outline: %s",
                outline_exc,
                exc_info=True,
            )
            outline_doc = {"version": 1, "nodes": [], "summary": None}

        if outline_doc is not None:
            await self._db.outlineversion.create(
                data={
                    "sessionId": session.id,
                    "version": 1,
                    "outlineData": json.dumps(outline_doc),
                    "changeReason": "drafted_on_session_create",
                }
            )
            await self._db.generationsession.update(
                where={"id": session.id},
                data={
                    "state": "AWAITING_OUTLINE_CONFIRM",
                    "stateReason": "outline_drafted",
                    "currentOutlineVersion": 1,
                },
            )
            await self._append_event(
                session_id=session.id,
                event_type="outline.updated",
                state="AWAITING_OUTLINE_CONFIRM",
                payload={"version": 1, "change_reason": "drafted_on_session_create"},
            )

        logger.info("Session created: %s for project %s", session.id, project_id)
        updated_session = await self._db.generationsession.find_unique(
            where={"id": session.id}
        )
        return self._to_session_ref(updated_session or session)

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
        session = await self._db.generationsession.find_unique(
            where={"id": session_id},
            include={"outlineVersions": True, "tasks": True},
        )
        if session is None:
            raise ValueError(f"Session not found: {session_id}")
        if session.userId != user_id:
            raise PermissionError("无权访问该会话")

        # 最新大纲
        outline = None
        if session.outlineVersions:
            latest = max(session.outlineVersions, key=lambda v: v.version)
            try:
                outline = json.loads(latest.outlineData)
            except (json.JSONDecodeError, AttributeError):
                outline = None

        fallbacks = []
        if session.fallbacksJson:
            try:
                fallbacks = json.loads(session.fallbacksJson)
            except json.JSONDecodeError:
                fallbacks = []

        # 取最近一次关联任务的 task_id
        latest_task_id = None
        if session.tasks:
            latest_task = max(session.tasks, key=lambda t: t.createdAt)
            latest_task_id = latest_task.id

        return {
            "session": self._to_session_ref(session, task_id=latest_task_id),
            "options": json.loads(session.options) if session.options else None,
            "outline": outline,
            "context_snapshot": None,
            "capabilities": _default_capabilities(),
            "fallbacks": fallbacks,
            "allowed_actions": self._guard.get_allowed_actions(session.state),
            "result": (
                {
                    "ppt_url": session.pptUrl,
                    "word_url": session.wordUrl,
                    "version": session.renderVersion,
                }
                if session.state == "SUCCESS"
                else None
            ),
            "error": (
                {
                    "code": session.errorCode,
                    "message": session.errorMessage,
                    "retryable": session.errorRetryable,
                    "fallback": None,
                    "transition_guard": "StateTransitionGuard",
                }
                if session.state == "FAILED" and session.errorCode
                else None
            ),
        }

    async def get_session_runtime_state(self, session_id: str, user_id: str) -> dict:
        """
        返回 SSE 轮询所需的轻量会话状态，避免每秒加载 outline/tasks。
        """
        session = await self._db.generationsession.find_unique(
            where={"id": session_id},
            select={
                "userId": True,
                "state": True,
                "lastCursor": True,
                "updatedAt": True,
            },
        )
        if session is None:
            raise ValueError(f"Session not found: {session_id}")

        owner_id = (
            session.get("userId") if isinstance(session, dict) else session.userId
        )
        if owner_id != user_id:
            raise PermissionError("无权访问该会话")

        state = session.get("state") if isinstance(session, dict) else session.state
        last_cursor = (
            session.get("lastCursor")
            if isinstance(session, dict)
            else session.lastCursor
        )
        updated_at = (
            session.get("updatedAt") if isinstance(session, dict) else session.updatedAt
        )
        return {
            "state": state,
            "last_cursor": last_cursor,
            "updated_at": updated_at,
        }

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
            task_type = self._normalize_task_type(session.outputType)
            template_config = self._extract_template_config(session.options)

            if task_queue_service is None:
                scheduled = await self._schedule_local_execution(
                    session_id=session_id,
                    task_id=created_task_id,
                    project_id=session.projectId,
                    task_type=task_type,
                    template_config=template_config,
                    fallback_reason="task_queue_unavailable_fallback_local_execution",
                )
                if scheduled:
                    warnings.append("task_queue_unavailable_fallback_local_execution")
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
            "session": self._to_session_ref(updated_session, task_id=created_task_id),
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
        session = await self._db.generationsession.find_unique(where={"id": session_id})
        if session is None:
            raise ValueError(f"Session not found: {session_id}")
        if session.userId != user_id:
            raise PermissionError("无权访问该会话")

        where: dict = {"sessionId": session_id}
        if cursor:
            # 找到 cursor 对应事件的 createdAt，返回之后的事件
            pivot = await self._db.sessionevent.find_unique(where={"cursor": cursor})
            if pivot and getattr(pivot, "sessionId", None) == session_id:
                where["createdAt"] = {"gt": pivot.createdAt}

        events = await self._db.sessionevent.find_many(
            where=where,
            order={"createdAt": "asc"},
            take=limit,
        )

        return [self._to_generation_event(e) for e in events]

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
        command_type = command.get("command_type")
        new_state = result.to_state

        if command_type == "UPDATE_OUTLINE":
            await self._handle_update_outline(session, command, new_state)
        elif command_type == "REDRAFT_OUTLINE":
            await self._handle_redraft_outline(session, command, new_state)
        elif command_type == "CONFIRM_OUTLINE":
            return await self._handle_confirm_outline(session, command, new_state)
        elif command_type == "REGENERATE_SLIDE":
            await self._handle_regenerate_slide(session, command, new_state)
        elif command_type == "RESUME_SESSION":
            await self._handle_resume_session(session, command, new_state)
        else:
            raise ValueError(f"未处理的命令类型：{command_type}")
        return None

    async def _handle_update_outline(self, session, command: dict, new_state: str):
        base_version = command.get("base_version", 0)
        outline_data = command.get("outline", {})
        change_reason = command.get("change_reason")

        # 并发版本冲突检查
        if session.currentOutlineVersion != base_version:
            raise ConflictError(
                f"大纲版本冲突：期望 {base_version}，当前 {session.currentOutlineVersion}"
            )

        new_version = base_version + 1
        await self._db.outlineversion.create(
            data={
                "sessionId": session.id,
                "version": new_version,
                "outlineData": json.dumps(outline_data),
                "changeReason": change_reason,
            }
        )
        await self._db.generationsession.update(
            where={"id": session.id},
            data={
                "state": new_state,
                "currentOutlineVersion": new_version,
                "renderVersion": {"increment": 1},
            },
        )
        await self._append_event(
            session_id=session.id,
            event_type="outline.updated",
            state=new_state,
            payload={"version": new_version, "change_reason": change_reason},
        )

    async def _handle_redraft_outline(self, session, command: dict, new_state: str):
        instruction = command.get("instruction", "")
        base_version = command.get("base_version", 0)

        if session.currentOutlineVersion != base_version:
            raise ConflictError(
                f"大纲版本冲突：期望 {base_version}，当前 {session.currentOutlineVersion}"
            )

        await self._db.generationsession.update(
            where={"id": session.id},
            data={"state": new_state, "renderVersion": {"increment": 1}},
        )
        await self._append_event(
            session_id=session.id,
            event_type="state.changed",
            state=new_state,
            payload={"instruction": instruction, "base_version": base_version},
        )
        # 实际 AI 重写由异步任务完成（C6 后续迭代接入 task_queue）

    async def _handle_confirm_outline(
        self, session, command: dict, new_state: str
    ) -> str:
        """确认大纲，更新状态，创建 GenerationTask，返回 task_id。"""
        expected_state = command.get("expected_state")
        if expected_state and session.state != expected_state:
            raise ConflictError(
                f"状态不匹配：期望 {expected_state}，当前 {session.state}"
            )

        # 解析 session options 以获取 template_config
        options: dict = {}
        if session.options:
            try:
                options = json.loads(session.options)
            except (json.JSONDecodeError, TypeError):
                options = {}
        task_type = self._normalize_task_type(session.outputType)

        # 创建 GenerationTask 并关联 session
        task = await self._db.generationtask.create(
            data={
                "projectId": session.projectId,
                "sessionId": session.id,
                "taskType": task_type,
                "status": "pending",
                "progress": 0,
                "inputData": (
                    json.dumps({"template_config": options.get("template_config")})
                    if options.get("template_config")
                    else None
                ),
            }
        )

        await self._db.generationsession.update(
            where={"id": session.id},
            data={
                "state": new_state,
                "renderVersion": {"increment": 1},
                "resumable": True,
            },
        )
        await self._append_event(
            session_id=session.id,
            event_type="task.created",
            state=new_state,
            payload={"confirmed": True, "task_id": task.id},
        )
        return task.id

    async def _handle_regenerate_slide(self, session, command: dict, new_state: str):
        slide_id = command.get("slide_id")
        patch = command.get("patch", {})
        expected_render_version = command.get("expected_render_version")

        if expected_render_version and session.renderVersion != expected_render_version:
            raise ConflictError(
                f"渲染版本冲突：期望 {expected_render_version}，当前 {session.renderVersion}"
            )

        await self._db.generationsession.update(
            where={"id": session.id},
            data={"state": new_state, "renderVersion": {"increment": 1}},
        )
        await self._append_event(
            session_id=session.id,
            event_type="slide.updated",
            state=new_state,
            payload={
                "slide_id": slide_id,
                "patch_schema_version": patch.get("schema_version", 1),
            },
        )

    async def _handle_resume_session(self, session, command: dict, new_state: str):
        cursor = command.get("cursor")
        await self._db.generationsession.update(
            where={"id": session.id},
            data={
                "state": new_state,
                "resumable": True,
                "lastCursor": cursor,
                "errorCode": None,
                "errorMessage": None,
            },
        )
        await self._append_event(
            session_id=session.id,
            event_type="session.recovered",
            state=new_state,
            payload={"resumed_from_cursor": cursor},
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

    @staticmethod
    def _extract_template_config(options_raw: Optional[str]) -> Optional[dict]:
        if not options_raw:
            return None
        try:
            options = json.loads(options_raw)
        except (TypeError, json.JSONDecodeError):
            return None
        template_config = options.get("template_config")
        return template_config if isinstance(template_config, dict) else None

    @staticmethod
    def _normalize_task_type(output_type: str) -> str:
        normalized = _SESSION_TO_TASK_TYPE.get((output_type or "").lower())
        if normalized is None:
            raise ConflictError(f"不支持的 output_type: {output_type}")
        return normalized

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
                    event_type="task.dispatched",
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

    @staticmethod
    def _to_session_ref(session, task_id: Optional[str] = None) -> dict:
        """将 Prisma GenerationSession 转为 SessionRef 字典（对齐 OpenAPI）。"""
        return {
            "session_id": session.id,
            "project_id": session.projectId,
            "task_id": task_id,  # 由调用方传入最新关联 task_id
            "state": session.state,
            "state_reason": session.stateReason,
            "status": _state_to_legacy_status(session.state),
            "contract_version": CONTRACT_VERSION,
            "schema_version": SCHEMA_VERSION,
            "progress": session.progress,
            "resumable": session.resumable,
            "updated_at": session.updatedAt.isoformat() if session.updatedAt else None,
            "render_version": session.renderVersion,
        }

    @staticmethod
    def _to_generation_event(event) -> dict:
        """将 Prisma SessionEvent 转为 GenerationEvent 字典（对齐 OpenAPI）。"""
        payload = None
        if event.payload:
            try:
                payload = json.loads(event.payload)
            except json.JSONDecodeError:
                payload = None
        return {
            "event_id": event.id,
            "event_schema_version": event.schemaVersion,
            "event_type": event.eventType,
            "state": event.state,
            "state_reason": event.stateReason,
            "progress": event.progress,
            "timestamp": event.createdAt.isoformat(),
            "cursor": event.cursor,
            "payload": payload,
        }


def _state_to_legacy_status(state: str) -> str:
    """将会话状态映射到旧版 task status 字段（兼容层）。"""
    mapping = {
        "IDLE": "pending",
        "CONFIGURING": "pending",
        "ANALYZING": "processing",
        "DRAFTING_OUTLINE": "processing",
        "AWAITING_OUTLINE_CONFIRM": "processing",
        "GENERATING_CONTENT": "processing",
        "RENDERING": "processing",
        "SUCCESS": "completed",
        "FAILED": "failed",
    }
    return mapping.get(state, "pending")


# ============================================================
# 并发冲突异常
# ============================================================


class ConflictError(Exception):
    """会话状态或版本冲突，对应 HTTP 409。"""

    pass
