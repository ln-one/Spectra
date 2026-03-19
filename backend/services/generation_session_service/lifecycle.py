"""Lifecycle helpers for generation session service."""

import json
from typing import Optional

from services.generation_session_service.constants import SessionLifecycleReason
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .helpers import _to_session_ref


async def create_session(
    db,
    project_id: str,
    user_id: str,
    output_type: str,
    options: Optional[dict],
    client_session_id: Optional[str],
    bootstrap_only: bool,
    task_queue_service,
    contract_version: str,
    schema_version: int,
    append_event,
    schedule_outline_draft_task,
) -> dict:
    existing_session = None
    if client_session_id:
        existing_session = await db.generationsession.find_first(
            where={
                "id": client_session_id,
                "projectId": project_id,
                "userId": user_id,
            }
        )

    if existing_session:
        update_data = {
            "outputType": output_type,
            "options": json.dumps(options) if options else None,
            "clientSessionId": client_session_id,
        }

        if bootstrap_only:
            session = await db.generationsession.update(
                where={"id": existing_session.id},
                data=update_data,
            )
            return _to_session_ref(session, contract_version, schema_version)

        if existing_session.state in {
            GenerationState.IDLE.value,
            GenerationState.CONFIGURING.value,
            GenerationState.FAILED.value,
        }:
            update_data.update(
                {
                    "state": GenerationState.DRAFTING_OUTLINE.value,
                    "renderVersion": 0,
                    "currentOutlineVersion": 0,
                    "resumable": True,
                }
            )
            session = await db.generationsession.update(
                where={"id": existing_session.id},
                data=update_data,
            )
            await append_event(
                session_id=session.id,
                event_type=GenerationEventType.STATE_CHANGED.value,
                state=GenerationState.DRAFTING_OUTLINE.value,
                progress=0,
                payload={"reason": SessionLifecycleReason.SESSION_CREATED.value},
            )
            await schedule_outline_draft_task(
                session_id=session.id,
                project_id=project_id,
                options=options,
                task_queue_service=task_queue_service,
            )
            return _to_session_ref(session, contract_version, schema_version)

        session = await db.generationsession.update(
            where={"id": existing_session.id},
            data=update_data,
        )
        return _to_session_ref(session, contract_version, schema_version)

    initial_state = (
        GenerationState.IDLE.value
        if bootstrap_only
        else GenerationState.DRAFTING_OUTLINE.value
    )
    session = await db.generationsession.create(
        data={
            "projectId": project_id,
            "userId": user_id,
            "outputType": output_type,
            "options": json.dumps(options) if options else None,
            "clientSessionId": client_session_id,
            "state": initial_state,
            "renderVersion": 0,
            "currentOutlineVersion": 0,
            "resumable": True,
        }
    )

    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=initial_state,
        progress=0,
        payload={"reason": SessionLifecycleReason.SESSION_CREATED.value},
    )

    if not bootstrap_only:
        await schedule_outline_draft_task(
            session_id=session.id,
            project_id=project_id,
            options=options,
            task_queue_service=task_queue_service,
        )

    return _to_session_ref(session, contract_version, schema_version)
