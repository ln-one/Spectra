import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _artifact_metadata_payload(artifact) -> dict:
    metadata_raw = getattr(artifact, "metadata", None)
    if isinstance(metadata_raw, dict):
        return dict(metadata_raw)
    if not isinstance(metadata_raw, str) or not metadata_raw.strip():
        return {}
    try:
        parsed = json.loads(metadata_raw)
    except (TypeError, json.JSONDecodeError):
        logger.debug(
            "artifact_metadata_parse_failed: artifact_id=%s metadata=%s",
            getattr(artifact, "id", None),
            metadata_raw,
        )
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _read_field(record, field_name: str):
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


def _artifact_belongs_to_session(artifact, session_id: str) -> bool:
    artifact_session_id = _read_field(artifact, "sessionId")
    return not artifact_session_id or artifact_session_id == session_id


async def _load_artifact_by_id(db_service, artifact_id: Optional[str]):
    if not artifact_id:
        return None
    artifact_model = getattr(db_service.db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "find_unique"):
        return None
    return await artifact_model.find_unique(where={"id": artifact_id})


async def _load_latest_session_artifact(db_service, session_id: str):
    artifact_model = getattr(db_service.db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "find_first"):
        return None
    return await artifact_model.find_first(
        where={"sessionId": session_id},
        order={"updatedAt": "desc"},
    )


async def _load_run_by_id(db_service, run_id: Optional[str]):
    if not run_id:
        return None
    run_model = getattr(db_service.db, "sessionrun", None)
    if run_model is None or not hasattr(run_model, "find_unique"):
        return None
    return await run_model.find_unique(where={"id": run_id})


async def resolve_preview_material_context(
    db_service,
    session_id: str,
    artifact_id: Optional[str],
    run_id: Optional[str] = None,
):
    run = await _load_run_by_id(db_service, run_id)
    if run_id and (not run or getattr(run, "sessionId", None) != session_id):
        return None

    artifact = None
    if run is not None and getattr(run, "artifactId", None):
        artifact = await _load_artifact_by_id(db_service, getattr(run, "artifactId"))
    if artifact is None and artifact_id:
        artifact = await _load_artifact_by_id(db_service, artifact_id)
    if artifact is None and not run_id:
        artifact = await _load_latest_session_artifact(db_service, session_id)
    if artifact is not None and not _artifact_belongs_to_session(artifact, session_id):
        artifact = None

    resolved_artifact_id = _read_field(artifact, "id")
    resolved_run_id = getattr(run, "id", None) if run is not None else run_id
    render_job_id = (
        str(resolved_artifact_id or "").strip()
        or str(resolved_run_id or "").strip()
        or f"session-{session_id}"
    )
    return {
        "artifact": artifact,
        "run": run,
        "artifact_id": resolved_artifact_id,
        "run_id": resolved_run_id,
        "render_job_id": render_job_id,
        "artifact_metadata": _artifact_metadata_payload(artifact) if artifact else {},
    }
