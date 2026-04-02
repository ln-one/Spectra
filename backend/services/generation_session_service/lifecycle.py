"""Lifecycle helpers for generation session service."""

import json
from typing import Optional
from uuid import uuid4

from services.generation_session_service.constants import SessionLifecycleReason
from services.generation_session_service.public_library_inputs import (
    apply_public_library_inputs,
)
from services.generation_session_service.session_history import (
    SESSION_TITLE_SOURCE_DEFAULT,
    build_numbered_default_session_title,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState

from .helpers import _to_session_ref

_REUSABLE_SESSION_STATES = {
    GenerationState.IDLE.value,
    GenerationState.CONFIGURING.value,
    GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    GenerationState.FAILED.value,
    GenerationState.SUCCESS.value,
}


async def _resolve_next_default_session_title(db, project_id: str) -> str:
    count_fn = getattr(getattr(db, "generationsession", None), "count", None)
    if count_fn is None:
        return build_numbered_default_session_title(1)
    existing_count = await count_fn(where={"projectId": project_id})
    return build_numbered_default_session_title(int(existing_count) + 1)


async def create_session(
    db,
    project_id: str,
    user_id: str,
    output_type: str,
    options: Optional[dict],
    client_session_id: Optional[str],
    bootstrap_only: bool,
    allow_create: bool,
    task_queue_service,
    contract_version: str,
    schema_version: int,
    append_event,
    schedule_outline_draft_task,
) -> dict:
    resolved_options = await apply_public_library_inputs(
        db=db,
        project_id=project_id,
        user_id=user_id,
        options=options,
    )
    project = await db.project.find_unique(where={"id": project_id})
    project_base_version_id = (
        getattr(project, "currentVersionId", None) if project is not None else None
    )
    existing_session = None
    if client_session_id:
        existing_session = await db.generationsession.find_first(
            where={
                "projectId": project_id,
                "userId": user_id,
                "OR": [
                    {"id": client_session_id},
                    {"clientSessionId": client_session_id},
                ],
            }
        )

    if existing_session:
        update_data = {
            "outputType": output_type,
            "options": json.dumps(resolved_options) if resolved_options else None,
            "clientSessionId": client_session_id,
        }
        if not getattr(existing_session, "displayTitle", None):
            update_data["displayTitle"] = await _resolve_next_default_session_title(
                db, project_id
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
                    "stateReason": SessionLifecycleReason.SESSION_REUSED.value,
                    "progress": 0,
                    "renderVersion": 0,
                    "currentOutlineVersion": 0,
                    "resumable": True,
                    "pptUrl": None,
                    "wordUrl": None,
                    "errorCode": None,
                    "errorMessage": None,
                    "errorRetryable": False,
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
                state_reason=SessionLifecycleReason.SESSION_REUSED.value,
                progress=0,
                payload={"reason": SessionLifecycleReason.SESSION_REUSED.value},
            )
            await schedule_outline_draft_task(
                session_id=session.id,
                project_id=project_id,
                options=resolved_options,
                task_queue_service=task_queue_service,
            )
            return _to_session_ref(session, contract_version, schema_version)

        session = await db.generationsession.update(
            where={"id": existing_session.id},
            data=update_data,
        )
        return _to_session_ref(session, contract_version, schema_version)

    if not allow_create:
        raise LookupError(
            "Existing generation session is required when allow_create is False"
        )

    initial_state = (
        GenerationState.IDLE.value
        if bootstrap_only
        else GenerationState.DRAFTING_OUTLINE.value
    )
    session_id = str(uuid4())
    default_display_title = await _resolve_next_default_session_title(db, project_id)
    session = await db.generationsession.create(
        data={
            "id": session_id,
            "projectId": project_id,
            "userId": user_id,
            "baseVersionId": project_base_version_id,
            "outputType": output_type,
            "options": json.dumps(resolved_options) if resolved_options else None,
            "clientSessionId": client_session_id,
            "state": initial_state,
            "renderVersion": 0,
            "currentOutlineVersion": 0,
            "resumable": True,
            "displayTitle": default_display_title,
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
            options=resolved_options,
            task_queue_service=task_queue_service,
        )

    return _to_session_ref(session, contract_version, schema_version)
