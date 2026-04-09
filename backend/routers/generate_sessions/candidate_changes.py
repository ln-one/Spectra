from __future__ import annotations

import logging
from typing import Optional

from fastapi import status

from services.database import db_service
from services.preview_helpers import (
    build_artifact_anchor,
    load_preview_material,
    strip_sources,
)
from services.project_space_service import project_space_service
from services.project_space_service.candidate_change_semantics import (
    serialize_candidate_change as serialize_candidate_change_payload,
)
from utils.exceptions import (
    APIException,
    ErrorCode,
    InternalServerException,
    NotFoundException,
)

logger = logging.getLogger(__name__)


def _artifact_timestamp_value(artifact) -> str:
    return (
        str(getattr(artifact, "updatedAt", None) or "").strip()
        or str(getattr(artifact, "createdAt", None) or "").strip()
    )


async def resolve_session_artifact_binding(
    project_id: str,
    session_id: str,
    artifact_id: Optional[str] = None,
    run_id: Optional[str] = None,
):
    """Resolve artifact binding for preview/export in session scope."""
    if run_id:
        run_model = getattr(getattr(db_service, "db", None), "sessionrun", None)
        run = (
            await run_model.find_unique(where={"id": run_id})
            if run_model is not None and hasattr(run_model, "find_unique")
            else None
        )
        if not run:
            raise NotFoundException(
                message=f"运行不存在: {run_id}",
                error_code=ErrorCode.NOT_FOUND,
            )
        if (
            getattr(run, "projectId", None) != project_id
            or getattr(run, "sessionId", None) != session_id
        ):
            raise NotFoundException(
                message=f"运行 {run_id} 不属于会话 {session_id}",
                error_code=ErrorCode.NOT_FOUND,
            )
        run_artifact_id = getattr(run, "artifactId", None)
        if not run_artifact_id:
            return None
        artifact = await project_space_service.get_artifact(run_artifact_id)
        if not artifact or artifact.projectId != project_id:
            return None
        if artifact.sessionId and artifact.sessionId != session_id:
            return None
        return artifact

    if artifact_id:
        artifact = await project_space_service.get_artifact(artifact_id)
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

    artifacts = await project_space_service.get_project_artifacts(
        project_id=project_id,
        session_id_filter=session_id,
    )
    if not artifacts:
        return None
    return sorted(
        artifacts,
        key=_artifact_timestamp_value,
        reverse=True,
    )[0]


def parse_candidate_change_payload(value, field_name: str) -> Optional[dict]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    raise APIException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code=ErrorCode.INVALID_INPUT,
        message=f"{field_name} must be an object",
    )


def serialize_candidate_change(change) -> dict:
    return serialize_candidate_change_payload(change, isoformat_datetimes=False)


async def create_session_candidate_change(
    *,
    session_id: str,
    user_id: str,
    snapshot: dict,
    body: Optional[dict] = None,
    extra_payload: Optional[dict] = None,
):
    body = body or {}
    custom_payload = parse_candidate_change_payload(body.get("payload"), "payload")

    project_id = snapshot["session"]["project_id"]
    anchor = snapshot.get("artifact_anchor")
    if not isinstance(anchor, dict):
        session_artifacts = snapshot.get("session_artifacts") or []
        first_artifact = session_artifacts[0] if session_artifacts else {}
        anchor = (
            first_artifact.get("artifact_anchor")
            if isinstance(first_artifact, dict)
            else None
        )
    if not isinstance(anchor, dict):
        anchor = build_session_artifact_anchor(session_id, None)

    artifact_model = getattr(getattr(db_service, "db", None), "artifact", None)
    requested_artifact_id = body.get("artifact_id")
    should_resolve_binding = (
        requested_artifact_id is not None
        and requested_artifact_id != anchor.get("artifact_id")
    ) or (anchor.get("artifact_id") is None and artifact_model is not None)
    if should_resolve_binding:
        bound_artifact = await resolve_session_artifact_binding(
            project_id=project_id,
            session_id=session_id,
            artifact_id=requested_artifact_id,
        )
        anchor = build_session_artifact_anchor(session_id, bound_artifact)
    project = await db_service.get_project(project_id)
    base_version_id = anchor["based_on_version_id"] or (
        getattr(project, "currentVersionId", None) if project else None
    )
    base_version_source = (
        "artifact_anchor"
        if anchor["based_on_version_id"]
        else ("project_current_version" if base_version_id else "none")
    )
    payload = dict(custom_payload or {})
    payload.update(
        {
            "source": "generate-session",
            "project_id": project_id,
            "session_id": session_id,
            "artifact_anchor": anchor,
            "base_version_context": {
                "selected_base_version_id": base_version_id,
                "source": base_version_source,
            },
            "session_artifacts": snapshot.get("session_artifacts") or [],
            "result": snapshot.get("result") or {},
            "outline": snapshot.get("outline"),
        }
    )
    if extra_payload:
        payload.update(extra_payload)

    return await project_space_service.create_candidate_change(
        project_id=project_id,
        user_id=user_id,
        title=body.get("title") or f"session-{session_id}-candidate-change",
        summary=body.get("summary"),
        payload=payload,
        session_id=session_id,
        base_version_id=base_version_id,
    )


async def attach_auto_candidate_change(
    *,
    session_id: str,
    user_id: str,
    snapshot: dict,
    body: dict,
    candidate_change_body: Optional[dict],
    idempotency_key: Optional[str],
    cache_scope: str,
    generation_command: dict,
    generation_result: dict,
    trigger: str,
) -> Optional[dict]:
    parsed_candidate_change = parse_candidate_change_payload(
        candidate_change_body, "candidate_change"
    )
    if parsed_candidate_change is None:
        return None

    candidate_change_input = dict(parsed_candidate_change)
    if body.get("artifact_id") and "artifact_id" not in candidate_change_input:
        candidate_change_input["artifact_id"] = body.get("artifact_id")

    project_id = snapshot["session"]["project_id"]
    cache_key = (
        f"{cache_scope}:{user_id}:{project_id}:{session_id}:{idempotency_key}"
        if idempotency_key
        else None
    )
    cached_change = None
    if cache_key:
        cached = await db_service.get_idempotency_response(cache_key)
        if isinstance(cached, dict):
            cached_change = cached.get("change")
    if cached_change is not None:
        return cached_change

    try:
        change = await create_session_candidate_change(
            session_id=session_id,
            user_id=user_id,
            snapshot=snapshot,
            body=candidate_change_input,
            extra_payload={
                "generation_command": generation_command,
                "generation_result": generation_result,
                "trigger": trigger,
            },
        )
    except APIException:
        raise
    except Exception as exc:  # pragma: no cover - exercised via API tests
        logger.error(
            "Auto candidate-change attachment failed: session_id=%s trigger=%s",
            session_id,
            trigger,
            exc_info=True,
        )
        raise InternalServerException(
            message="Auto candidate change submission failed, please retry.",
            details={
                "session_id": session_id,
                "trigger": trigger,
                "cause": exc.__class__.__name__,
            },
        )

    cached_change = serialize_candidate_change(change)
    if cache_key:
        await db_service.save_idempotency_response(cache_key, {"change": cached_change})
    return cached_change


def build_session_artifact_anchor(session_id: str, artifact) -> dict:
    """Backward-compatible wrapper for tests and patches."""
    return build_artifact_anchor(session_id, artifact)


def without_sources(slides: list[dict], lesson_plan: Optional[dict]):
    """Backward-compatible wrapper for tests and patches."""
    return strip_sources(slides, lesson_plan)


async def load_session_preview_material(
    session_id: str,
    project_id: str,
    artifact_id: Optional[str] = None,
    task_id: Optional[str] = None,
    run_id: Optional[str] = None,
):
    """Backward-compatible wrapper for tests and patches."""
    return await load_preview_material(
        session_id,
        project_id,
        artifact_id,
        task_id,
        run_id,
    )
