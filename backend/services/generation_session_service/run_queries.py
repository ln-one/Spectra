from __future__ import annotations

import asyncio
from typing import Any

from services.generation_session_service.session_history import (
    RUN_STATUS_PENDING,
    RUN_STATUS_PROCESSING,
    RUN_STEP_OUTLINE,
    RUN_TITLE_SOURCE_PENDING,
    create_session_run,
    serialize_session_run,
)

_OUTPUT_TOOL_TYPE_MAP = {
    "ppt": "ppt_generate",
    "word": "word_generate",
    "both": "both_generate",
}


def resolve_output_tool_type(output_type: str) -> str:
    return _OUTPUT_TOOL_TYPE_MAP.get(
        str(output_type or "").strip().lower(), "both_generate"
    )


def _supports_session_run(db: Any) -> bool:
    return hasattr(db, "sessionrun")


async def get_session_run(db, session_id: str, run_id: str) -> Any | None:
    if not _supports_session_run(db):
        return None
    run = await db.sessionrun.find_unique(where={"id": run_id})
    if not run:
        return None
    if getattr(run, "sessionId", None) != session_id:
        return None
    return run


async def get_latest_active_session_run(
    db,
    session_id: str,
) -> Any | None:
    if not _supports_session_run(db):
        return None
    return await db.sessionrun.find_first(
        where={
            "sessionId": session_id,
            "status": {"in": [RUN_STATUS_PENDING, RUN_STATUS_PROCESSING]},
        },
        order={"updatedAt": "desc"},
    )


async def get_latest_active_session_run_by_tool(
    db,
    session_id: str,
    tool_type: str,
) -> Any | None:
    if not _supports_session_run(db):
        return None
    return await db.sessionrun.find_first(
        where={
            "sessionId": session_id,
            "toolType": tool_type,
            "status": {"in": [RUN_STATUS_PENDING, RUN_STATUS_PROCESSING]},
        },
        order={"updatedAt": "desc"},
    )


async def create_outline_session_run(
    *,
    db,
    session_id: str,
    project_id: str,
    output_type: str,
) -> dict | None:
    run = await create_session_run(
        db=db,
        session_id=session_id,
        project_id=project_id,
        tool_type=resolve_output_tool_type(output_type),
        step=RUN_STEP_OUTLINE,
        status=RUN_STATUS_PROCESSING,
        title_source=RUN_TITLE_SOURCE_PENDING,
    )
    return serialize_session_run(run)


async def list_session_runs(
    *,
    db,
    session_id: str,
    page: int = 1,
    limit: int = 20,
) -> dict:
    if not _supports_session_run(db):
        return {"runs": [], "total": 0, "page": page, "limit": limit}
    skip = (page - 1) * limit
    runs, total = await asyncio.gather(
        db.sessionrun.find_many(
            where={"sessionId": session_id},
            order={"updatedAt": "desc"},
            skip=skip,
            take=limit,
        ),
        db.sessionrun.count(where={"sessionId": session_id}),
    )
    return {
        "runs": [serialize_session_run(run) for run in runs],
        "total": total,
        "page": page,
        "limit": limit,
    }
