from __future__ import annotations

from typing import Optional

from fastapi import status

from routers.generate_sessions.candidate_changes import (
    build_session_artifact_anchor,
    resolve_session_artifact_binding,
)
from routers.generate_sessions.shared import (
    get_session_service,
    load_session_preview_snapshot_or_raise,
)
from utils.exceptions import APIException, ErrorCode


def resolve_modify_expected_render_version(body: dict) -> Optional[int]:
    expected_render_version = body.get("expected_render_version")
    base_render_version = body.get("base_render_version")
    if (
        expected_render_version is not None
        and base_render_version is not None
        and expected_render_version != base_render_version
    ):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=(
                "expected_render_version 与 base_render_version 同时提供时必须一致"
            ),
        )
    return (
        expected_render_version
        if expected_render_version is not None
        else base_render_version
    )


def normalize_export_format(raw_format: object) -> str:
    if not isinstance(raw_format, str) or not raw_format.strip():
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message="format 为必填字段",
        )
    normalized = raw_format.strip().lower()
    allowed = {"json", "markdown", "html"}
    if normalized not in allowed:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code=ErrorCode.INVALID_INPUT,
            message=f"format 必须是 {sorted(allowed)} 之一",
        )
    return normalized


async def get_preview_snapshot_or_raise(session_id: str, user_id: str) -> dict:
    svc = get_session_service()
    return await load_session_preview_snapshot_or_raise(svc, session_id, user_id)


async def resolve_preview_anchor(
    session_id: str,
    snapshot: dict,
    artifact_id: Optional[str],
):
    bound_artifact = await resolve_session_artifact_binding(
        project_id=snapshot["session"]["project_id"],
        session_id=session_id,
        artifact_id=artifact_id,
    )
    return build_session_artifact_anchor(session_id, bound_artifact)
