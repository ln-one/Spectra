"""Lifecycle helpers for generation session service."""

import json
from typing import Optional
from uuid import uuid4

from services.generation_session_service.constants import SessionLifecycleReason
from services.generation_session_service.session_history import (
    SESSION_TITLE_SOURCE_DEFAULT,
    build_default_session_title,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .helpers import _to_session_ref

_REUSABLE_SESSION_STATES = {
    GenerationState.IDLE.value,
    GenerationState.CONFIGURING.value,
    GenerationState.FAILED.value,
}


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
    project = await db.project.find_unique(where={"id": project_id})
    project_base_version_id = (
        getattr(project, "currentVersionId", None) if project is not None else None
    )
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
        if not getattr(existing_session, "displayTitle", None):
            update_data["displayTitle"] = build_default_session_title(
                existing_session.id
            )
            update_data["displayTitleSource"] = SESSION_TITLE_SOURCE_DEFAULT
        if (
            getattr(existing_session, "baseVersionId", None) is None
            and project_base_version_id is not None
        ):
            update_data["baseVersionId"] = project_base_version_id

        if bootstrap_only:
            session = await db.generationsession.update(
                where={"id": existing_session.id},
                data=update_data,
            )
            return _to_session_ref(session, contract_version, schema_version)

        if existing_session.state in _REUSABLE_SESSION_STATES:
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
                payload={"reason": SessionLifecycleReason.SESSION_REUSED.value},
            )
            await schedule_outline_draft_task(
                session_id=session.id,
                project_id=project_id,
                options=options,
                task_queue_service=task_queue_service,
            )
            return _to_session_ref(session, contract_version, schema_version)

        if existing_session.state == GenerationState.SUCCESS.value:
            existing_session = None
        else:
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
    session_id = str(uuid4())
    session = await db.generationsession.create(
        data={
            "id": session_id,
            "projectId": project_id,
            "userId": user_id,
            "baseVersionId": project_base_version_id,
            "outputType": output_type,
            "options": json.dumps(options) if options else None,
            "clientSessionId": client_session_id,
            "state": initial_state,
            "renderVersion": 0,
            "currentOutlineVersion": 0,
            "resumable": True,
            "displayTitle": build_default_session_title(session_id),
            "displayTitleSource": SESSION_TITLE_SOURCE_DEFAULT,
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
