from __future__ import annotations

import asyncio
import json
from typing import Optional

from schemas.generation import build_generation_result_payload
from services.generation_session_service.access import get_owned_session
from services.generation_session_service.serialization_helpers import _to_session_ref
from services.platform.state_transition_guard import GenerationState
from services.preview_helpers import build_artifact_anchor


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


async def _load_latest_task_id(db, session) -> Optional[str]:
    task_model = getattr(db, "generationtask", None)
    if task_model is None or not hasattr(task_model, "find_first"):
        return None

    latest = await task_model.find_first(
        where={"sessionId": session.id},
        order={"createdAt": "desc"},
    )
    return getattr(latest, "id", None) if latest else None


async def _load_latest_session_artifact(db, project_id: str, session_id: str):
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "find_first"):
        return None
    return await artifact_model.find_first(
        where={"projectId": project_id, "sessionId": session_id},
        order={"updatedAt": "desc"},
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

    latest_task_id, latest_artifact = await asyncio.gather(
        _load_latest_task_id(db, session),
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
            task_id=latest_task_id,
        ),
        "options": _parse_json_object(getattr(session, "options", None)),
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
