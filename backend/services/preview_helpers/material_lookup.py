import json
import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

from services.database.prisma_compat import (
    find_first_with_select_fallback,
    find_many_with_select_fallback,
    find_unique_with_select_fallback,
)

logger = logging.getLogger(__name__)

TASK_PREVIEW_SELECT = {
    "id": True,
    "status": True,
    "sessionId": True,
    "templateConfig": True,
    "inputData": True,
}


def extract_task_id_from_artifact(artifact) -> Optional[str]:
    metadata_raw = getattr(artifact, "metadata", None)
    if metadata_raw:
        try:
            metadata = json.loads(metadata_raw)
            task_id = metadata.get("task_id")
            if isinstance(task_id, str) and task_id.strip():
                return task_id.strip()
        except (TypeError, json.JSONDecodeError):
            logger.debug(
                "artifact_metadata_task_id_parse_failed: artifact_metadata=%s",
                metadata_raw,
            )

    storage_path = getattr(artifact, "storagePath", None)
    if not storage_path:
        return None
    stem = Path(storage_path).stem
    try:
        UUID(stem)
    except ValueError:
        return None
    return stem


def _parse_task_input(raw: object) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def resolve_task_by_artifact(
    db_service, session_id: str, artifact_id: Optional[str]
):
    if not artifact_id:
        return None
    artifact = await find_unique_with_select_fallback(
        model=db_service.db.artifact,
        where={"id": artifact_id},
        select={"sessionId": True, "metadata": True, "storagePath": True},
    )
    if not artifact:
        return None
    if getattr(artifact, "sessionId", None) != session_id:
        return None

    task_id = extract_task_id_from_artifact(artifact)
    if task_id:
        task = await find_unique_with_select_fallback(
            model=db_service.db.generationtask,
            where={"id": task_id},
            select=TASK_PREVIEW_SELECT,
        )
        if task and getattr(task, "sessionId", None) == session_id:
            return task
    return None


async def resolve_task_by_run(db_service, session_id: str, run_id: Optional[str]):
    if not run_id:
        return None

    run_model = getattr(db_service.db, "sessionrun", None)
    if run_model is None or not hasattr(run_model, "find_unique"):
        return None

    run = await run_model.find_unique(where={"id": run_id})
    if not run or getattr(run, "sessionId", None) != session_id:
        return None

    run_artifact_id = getattr(run, "artifactId", None)
    if run_artifact_id:
        task = await resolve_task_by_artifact(db_service, session_id, run_artifact_id)
        if task is not None:
            return task

    recent_tasks = await find_many_with_select_fallback(
        model=db_service.db.generationtask,
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=50,
        select=TASK_PREVIEW_SELECT,
    )
    for task in recent_tasks:
        input_data = _parse_task_input(getattr(task, "inputData", None))
        if str(input_data.get("run_id") or "").strip() == run_id:
            return task
    return None


async def resolve_preview_task(
    db_service,
    session_id: str,
    artifact_id: Optional[str],
    task_id: Optional[str],
    run_id: Optional[str] = None,
):
    if run_id:
        return await resolve_task_by_run(db_service, session_id, run_id)

    task = await resolve_task_by_artifact(db_service, session_id, artifact_id)
    if task is None and task_id:
        task = await find_unique_with_select_fallback(
            model=db_service.db.generationtask,
            where={"id": task_id},
            select=TASK_PREVIEW_SELECT,
        )
        if task and getattr(task, "sessionId", None) != session_id:
            task = None
    if task is not None:
        return task

    task_model = db_service.db.generationtask
    if hasattr(task_model, "find_first"):
        return await find_first_with_select_fallback(
            model=task_model,
            where={"sessionId": session_id},
            order={"createdAt": "desc"},
            select=TASK_PREVIEW_SELECT,
        )

    tasks = await find_many_with_select_fallback(
        model=task_model,
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=1,
        select=TASK_PREVIEW_SELECT,
    )
    return tasks[0] if tasks else None
