"""
Session-First 生成路由（C6）

实现 OpenAPI 契约中 /generate/sessions 系列端点（10 条主入口 + 4 条预览域）。
所有写操作经过 StateTransitionGuard 校验，响应包含 transition.validated_by。

契约参考：docs/openapi.yaml /api/v1/generate/sessions*
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Request, status

from services.database import db_service
from services.generation_session_service import GenerationSessionService
from services.preview_helpers import (
    build_artifact_anchor,
    load_preview_material,
    strip_sources,
)
from utils.exceptions import APIException, ErrorCode, NotFoundException

router = APIRouter(prefix="/generate", tags=["Generate"])
logger = logging.getLogger(__name__)

CONTRACT_VERSION = "2026-03"


# ============================================================
# 辅助：获取 service 实例（使用共享 db_service.db）
# ============================================================


def _get_session_service() -> GenerationSessionService:
    return GenerationSessionService(db=db_service.db)


def _get_task_queue_service(request: Request):
    """Extract task_queue_service from app state (None if Redis unavailable)."""
    return getattr(request.app.state, "task_queue_service", None)


def _parse_idempotency_key(key: Optional[UUID]) -> Optional[str]:
    return str(key) if key else None


def _validate_positive_int(value, field_name: str):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"{field_name} must be an integer >= 1",
        )


def _validate_optional_positive_int(value, field_name: str):
    if value is None:
        return
    _validate_positive_int(value, field_name)


def _validate_command_payload(command: dict):
    if not isinstance(command, dict):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="command must be an object",
        )

    command_type = command.get("command_type")
    if not command_type:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="command.command_type is required",
        )

    if command_type in {"UPDATE_OUTLINE", "REDRAFT_OUTLINE"}:
        _validate_positive_int(command.get("base_version"), "base_version")
    if command_type == "REGENERATE_SLIDE":
        _validate_optional_positive_int(
            command.get("expected_render_version"),
            "expected_render_version",
        )


# ============================================================
# 通用 409 错误转换
# ============================================================


def _raise_conflict(msg: str):
    raise APIException(
        status_code=status.HTTP_409_CONFLICT,
        error_code=ErrorCode.RESOURCE_CONFLICT,
        message=msg,
        details={"transition_guard": "StateTransitionGuard"},
    )


async def _resolve_session_artifact_binding(
    project_id: str, session_id: str, artifact_id: Optional[str] = None
):
    """Resolve artifact binding for preview/export in session scope."""
    if artifact_id:
        artifact = await db_service.get_artifact(artifact_id)
        if not artifact or artifact.projectId != project_id:
            raise NotFoundException(
                message=f"成果不存在: {artifact_id}",
                error_code=ErrorCode.NOT_FOUND,
            )
        if artifact.sessionId and artifact.sessionId != session_id:
            raise NotFoundException(
                message=f"成果 {artifact_id} 不属于会话 {session_id}",
                error_code=ErrorCode.NOT_FOUND,
            )
        return artifact

    return await db_service.db.artifact.find_first(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
    )


def _build_artifact_anchor(session_id: str, artifact) -> dict:
    """Backward-compatible wrapper for tests and patches."""
    return build_artifact_anchor(session_id, artifact)


def _without_sources(slides: list[dict], lesson_plan: Optional[dict]):
    """Backward-compatible wrapper for tests and patches."""
    return strip_sources(slides, lesson_plan)


async def _load_preview_material(session_id: str, project_id: str):
    """Backward-compatible wrapper for tests and patches."""
    return await load_preview_material(session_id, project_id)


from routers.generate_sessions_commands import router as commands_router
from routers.generate_sessions_core import router as core_router
from routers.generate_sessions_preview import router as preview_router

router.include_router(core_router)
router.include_router(commands_router)
router.include_router(preview_router)
