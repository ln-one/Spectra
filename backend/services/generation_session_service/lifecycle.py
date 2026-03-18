"""Lifecycle helpers for generation session service."""

import json
from typing import Optional

from .helpers import _to_session_ref


async def create_session(
    db,
    project_id: str,
    user_id: str,
    output_type: str,
    options: Optional[dict],
    client_session_id: Optional[str],
    task_queue_service,
    contract_version: str,
    schema_version: int,
    append_event,
    schedule_outline_draft_task,
) -> dict:
    session = await db.generationsession.create(
        data={
            "projectId": project_id,
            "userId": user_id,
            "outputType": output_type,
            "options": json.dumps(options) if options else None,
            "clientSessionId": client_session_id,
            "state": "DRAFTING_OUTLINE",
            "renderVersion": 0,
            "currentOutlineVersion": 0,
            "resumable": True,
        }
    )

    await append_event(
        session_id=session.id,
        event_type="state.changed",
        state="DRAFTING_OUTLINE",
        progress=0,
        payload={"reason": "session_created"},
    )

    await schedule_outline_draft_task(
        session_id=session.id,
        project_id=project_id,
        options=options,
        task_queue_service=task_queue_service,
    )

    return _to_session_ref(session, contract_version, schema_version)
