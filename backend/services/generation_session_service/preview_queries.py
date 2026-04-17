from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from schemas.generation import build_generation_result_payload
from services.diego_client import build_diego_client
from services.generation_session_service.access import get_owned_session
from services.generation_session_service.diego_runtime_state import mark_diego_failed
from services.generation_session_service.serialization_helpers import _to_session_ref
from services.generation_session_service.session_history import (
    get_latest_session_run,
    serialize_session_run,
)
from services.platform.state_transition_guard import GenerationState
from services.preview_helpers import build_artifact_anchor

logger = logging.getLogger(__name__)

_DIEGO_FAILED_STATUS = "FAILED"
_DIEGO_ACTIVE_SESSION_STATES = {
    GenerationState.GENERATING_CONTENT.value,
    GenerationState.RENDERING.value,
}


def _parse_json_object(raw: object) -> Optional[dict]:
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _read_diego_binding(options: Optional[dict]) -> Optional[dict]:
    if not isinstance(options, dict):
        return None
    binding = options.get("diego")
    return binding if isinstance(binding, dict) else None


async def _load_latest_session_artifact(db, project_id: str, session_id: str):
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "find_first"):
        return None
    return await artifact_model.find_first(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
    )


async def _reconcile_diego_failed_session(
    *,
    db,
    session,
    options: Optional[dict],
):
    if getattr(session, "state", None) not in _DIEGO_ACTIVE_SESSION_STATES:
        return session

    binding = _read_diego_binding(options)
    if not binding:
        return session

    diego_run_id = str(binding.get("diego_run_id") or "").strip()
    if not diego_run_id:
        return session

    client = build_diego_client()
    if client is None:
        return session

    try:
        detail = await client.get_run(diego_run_id)
    except Exception as exc:
        logger.warning(
            "diego_terminal_reconcile_skipped session_id=%s diego_run_id=%s error=%s",
            getattr(session, "id", None),
            diego_run_id,
            exc,
        )
        return session

    status = str(detail.get("status") or "").strip().upper()
    if status != _DIEGO_FAILED_STATUS:
        return session

    error_details = detail.get("error_details")
    error_message = "Diego run failed"
    if isinstance(error_details, dict):
        error_message = str(
            error_details.get("message")
            or error_details.get("reason")
            or error_message
        )

    await mark_diego_failed(
        db=db,
        session_id=session.id,
        run_id=str(binding.get("spectra_run_id") or "").strip() or None,
        diego_run_id=diego_run_id,
        error_code=str(detail.get("error_code") or "DIEGO_RUN_FAILED"),
        error_message=error_message,
        retryable=bool(detail.get("retryable")),
    )
    logger.info(
        "diego_terminal_reconciled_failed session_id=%s diego_run_id=%s",
        session.id,
        diego_run_id,
    )
    return await get_owned_session(
        db=db,
        session_id=session.id,
        user_id=session.userId,
        select={
            "id": True,
            "projectId": True,
            "userId": True,
            "baseVersionId": True,
            "state": True,
            "stateReason": True,
            "progress": True,
            "resumable": True,
            "updatedAt": True,
            "renderVersion": True,
            "options": True,
            "pptUrl": True,
            "wordUrl": True,
        },
    )


async def get_session_preview_snapshot(
    *,
    db,
    session_id: str,
    user_id: str,
    contract_version: str,
    schema_version: int,
) -> dict:
    session = await get_owned_session(
        db=db,
        session_id=session_id,
        user_id=user_id,
        select={
            "id": True,
            "projectId": True,
            "userId": True,
            "baseVersionId": True,
            "state": True,
            "stateReason": True,
            "progress": True,
            "resumable": True,
            "updatedAt": True,
            "renderVersion": True,
            "options": True,
            "pptUrl": True,
            "wordUrl": True,
        },
    )
    options = _parse_json_object(getattr(session, "options", None))
    session = await _reconcile_diego_failed_session(
        db=db,
        session=session,
        options=options,
    )

    latest_run, latest_artifact = await asyncio.gather(
        get_latest_session_run(db, session.id),
        _load_latest_session_artifact(db, session.projectId, session.id),
    )
    based_on_version_id = (
        getattr(latest_artifact, "basedOnVersionId", None) if latest_artifact else None
    )

    return {
        "session": _to_session_ref(
            session,
            contract_version,
            schema_version,
        ),
        "options": _parse_json_object(getattr(session, "options", None)),
        "current_run": serialize_session_run(latest_run),
        "artifact_id": (
            getattr(latest_artifact, "id", None) if latest_artifact else None
        ),
        "based_on_version_id": based_on_version_id,
        "artifact_anchor": build_artifact_anchor(session_id, latest_artifact),
        "result": (
            build_generation_result_payload(
                ppt_url=session.pptUrl,
                word_url=session.wordUrl,
                version=session.renderVersion,
            )
            if session.state == GenerationState.SUCCESS.value
            else None
        ),
    }
