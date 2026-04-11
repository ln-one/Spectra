from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from services.generation_session_service.run_constants import (
    RUN_STATUS_PROCESSING,
    RUN_TITLE_SOURCE_PENDING,
    build_pending_run_title,
    build_run_scope_key,
)

logger = logging.getLogger(__name__)


def supports_session_run(db: Any) -> bool:
    return hasattr(db, "sessionrun")


async def get_latest_session_run(db, session_id: str) -> Any | None:
    if not supports_session_run(db):
        return None
    try:
        return await db.sessionrun.find_first(
            where={"sessionId": session_id},
            order={"createdAt": "desc"},
        )
    except Exception as exc:
        logger.warning("Skip session run lookup: session=%s error=%s", session_id, exc)
        return None


async def create_session_run(
    *,
    db,
    session_id: Optional[str],
    project_id: str,
    tool_type: str,
    step: str,
    status: str = RUN_STATUS_PROCESSING,
    title_source: str = RUN_TITLE_SOURCE_PENDING,
    artifact_id: Optional[str] = None,
) -> Any:
    if not supports_session_run(db):
        return None
    scope_key = build_run_scope_key(session_id=session_id, project_id=project_id)

    last_error: Exception | None = None
    for _ in range(3):
        try:
            run_no = (
                await db.sessionrun.count(
                    where={
                        "runScopeKey": scope_key,
                        "toolType": tool_type,
                    }
                )
                + 1
            )
        except Exception as exc:
            logger.warning(
                (
                    "Skip session run create before storage is ready: "
                    "project=%s session=%s tool=%s error=%s"
                ),
                project_id,
                session_id,
                tool_type,
                exc,
            )
            return None
        title = build_pending_run_title(run_no, tool_type)
        try:
            return await db.sessionrun.create(
                data={
                    "runScopeKey": scope_key,
                    "sessionId": session_id,
                    "projectId": project_id,
                    "toolType": tool_type,
                    "runNo": run_no,
                    "title": title,
                    "titleSource": title_source,
                    "status": status,
                    "step": step,
                    "artifactId": artifact_id,
                }
            )
        except Exception as exc:  # pragma: no cover
            last_error = exc
            if "runScopeKey" not in str(exc) and "Unique" not in str(exc):
                raise
            logger.warning(
                "Retrying SessionRun create after uniqueness conflict: %s", exc
            )
    if last_error:
        raise last_error
    raise RuntimeError("Failed to create session run")


async def update_session_run(
    *,
    db,
    run_id: str,
    title: Optional[str] = None,
    title_source: Optional[str] = None,
    status: Optional[str] = None,
    step: Optional[str] = None,
    artifact_id: Optional[str] = None,
) -> Any:
    if not supports_session_run(db):
        return None
    data: dict[str, Any] = {}
    if title is not None:
        data["title"] = title
        data["titleUpdatedAt"] = datetime.now(timezone.utc)
    if title_source is not None:
        data["titleSource"] = title_source
        if title is None:
            data["titleUpdatedAt"] = datetime.now(timezone.utc)
    if status is not None:
        data["status"] = status
    if step is not None:
        data["step"] = step
    if artifact_id is not None:
        data["artifactId"] = artifact_id
    if not data:
        try:
            return await db.sessionrun.find_unique(where={"id": run_id})
        except Exception as exc:
            logger.warning("Skip session run read: run=%s error=%s", run_id, exc)
            return None
    try:
        return await db.sessionrun.update(where={"id": run_id}, data=data)
    except Exception as exc:
        logger.warning("Skip session run update: run=%s error=%s", run_id, exc)
        return None
