"""
GenerationSessionService - 会话化生成主链路服务

实现 C6 Gamma 流：创建会话、状态管理、大纲版本控制、事件追加、结果回写。
所有状态写操作经过 StateTransitionGuard 校验。

契约参考：docs/openapi.yaml SessionStatePayload / GenerationSession
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Optional

from services.generation_session_service.command_api import SessionCommandMixin
from services.generation_session_service.helpers import (
    _build_outline_requirements,
    _default_capabilities,
    _extract_outline_style,
)
from services.generation_session_service.lifecycle import create_session
from services.generation_session_service.query_api import SessionQueryMixin
from services.generation_session_service.task_runtime import SessionTaskRuntimeMixin
from services.state_transition_guard import StateTransitionGuard, state_transition_guard

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


class GenerationSessionService(
    SessionCommandMixin,
    SessionQueryMixin,
    SessionTaskRuntimeMixin,
):
    """
    会话化生成主链路服务（C6）。

    使用说明：注入 Prisma 客户端实例，所有方法均为 async。
    """

    CONTRACT_VERSION = CONTRACT_VERSION
    SCHEMA_VERSION = SCHEMA_VERSION
    _EXECUTION_TRIGGER_COMMANDS = _EXECUTION_TRIGGER_COMMANDS
    conflict_error_cls = None

    def __init__(
        self, db: Prisma, guard: StateTransitionGuard = state_transition_guard
    ):
        self._db = db
        self._guard = guard

    async def create_session(
        self,
        project_id: str,
        user_id: str,
        output_type: str,
        options: Optional[dict] = None,
        client_session_id: Optional[str] = None,
        task_queue_service=None,
    ) -> dict:
        session_ref = await create_session(
            db=self._db,
            project_id=project_id,
            user_id=user_id,
            output_type=output_type,
            options=options,
            client_session_id=client_session_id,
            task_queue_service=task_queue_service,
            contract_version=self.CONTRACT_VERSION,
            schema_version=self.SCHEMA_VERSION,
            append_event=self._append_event,
            schedule_outline_draft_task=self._schedule_outline_draft_task,
        )
        logger.info("Session created for project %s", project_id)
        return session_ref


class ConflictError(Exception):
    """会话状态或版本冲突，对应 HTTP 409。"""

    pass


GenerationSessionService.conflict_error_cls = ConflictError
