import json
import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

logger = logging.getLogger(__name__)

TASK_PREVIEW_FIELDS = (
    "id",
    "status",
    "sessionId",
    "templateConfig",
    "inputData",
)


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


def _read_field(record, field_name: str):
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


def _has_field(record, field_name: str) -> bool:
    if isinstance(record, dict):
        return field_name in record
    return hasattr(record, field_name)


def _has_fields(record, field_names: tuple[str, ...]) -> bool:
    return all(_has_field(record, field_name) for field_name in field_names)


async def _load_task_by_id(db_service, task_id: Optional[str]):
    if not task_id:
        return None
    task_model = getattr(db_service.db, "generationtask", None)
    if task_model is None or not hasattr(task_model, "find_unique"):
        return None
    return await task_model.find_unique(where={"id": task_id})


async def _ensure_preview_task_shape(db_service, task):
    if task is None:
        return None
    if _has_fields(task, TASK_PREVIEW_FIELDS):
        return task
    return await _load_task_by_id(db_service, _read_field(task, "id"))


async def resolve_task_by_artifact(
    db_service, session_id: str, artifact_id: Optional[str]
):
    if not artifact_id:
        return None
    artifact_model = getattr(db_service.db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "find_unique"):
        return None
    artifact = await artifact_model.find_unique(where={"id": artifact_id})
    if not artifact:
        return None
    if _read_field(artifact, "sessionId") != session_id:
        return None

    task_id = extract_task_id_from_artifact(artifact)
    if task_id:
        task = await _load_task_by_id(db_service, task_id)
        if task and _read_field(task, "sessionId") == session_id:
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

    candidate_tasks = await db_service.db.generationtask.find_many(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=50,
    )
    for candidate in candidate_tasks:
        task_id = _read_field(candidate, "id")
        if not task_id:
            continue
        task = await _ensure_preview_task_shape(db_service, candidate)
        if task is None or _read_field(task, "sessionId") != session_id:
            continue
        input_data = _parse_task_input(_read_field(task, "inputData"))
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
        task = await _load_task_by_id(db_service, task_id)
        if task and _read_field(task, "sessionId") != session_id:
            task = None
    if task is not None:
        return task

    tasks = await db_service.db.generationtask.find_many(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=1,
    )
    if not tasks:
        return None
    return await _ensure_preview_task_shape(db_service, tasks[0])
