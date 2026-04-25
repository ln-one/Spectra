from __future__ import annotations

import asyncio
from typing import Optional

from schemas.generation import build_generation_result_payload
from services.generation_session_service.run_queries import get_session_run
from services.generation_session_service.serialization_helpers import _to_session_run
from services.generation_session_service.session_artifacts import (
    get_latest_session_candidate_change,
    get_session_artifact_history,
)
from services.generation_session_service.session_history import get_latest_session_run
from services.platform.state_transition_guard import GenerationState


async def load_snapshot_runtime_components(
    *,
    db,
    session,
    run_id: Optional[str],
):
    artifact_history, latest_candidate_change, current_run = await asyncio.gather(
        get_session_artifact_history(
            db=db,
            project_id=session.projectId,
            session_id=session.id,
        ),
        get_latest_session_candidate_change(
            db=db,
            project_id=session.projectId,
            session_id=session.id,
        ),
        (
            get_session_run(db, session.id, run_id)
            if run_id
            else get_latest_session_run(db, session.id)
        ),
    )
    return {
        "artifact_history": artifact_history,
        "latest_candidate_change": latest_candidate_change,
        "current_run": current_run,
    }


def build_snapshot_result(session) -> dict | None:
    has_bound_output = bool(
        str(getattr(session, "pptUrl", "") or "").strip()
        or str(getattr(session, "wordUrl", "") or "").strip()
    )
    if session.state != GenerationState.SUCCESS.value and not has_bound_output:
        return None
    return build_generation_result_payload(
        ppt_url=session.pptUrl,
        word_url=session.wordUrl,
        version=session.renderVersion,
    )


def serialize_current_run(run) -> dict | None:
    return _to_session_run(run)
