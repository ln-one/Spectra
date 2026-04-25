from __future__ import annotations

import json

from services.generation_session_service.event_store import (
    persist_session_update_and_events,
)
from services.generation_session_service.teaching_brief_proposals import (
    remove_proposal_by_id,
)
from services.generation_session_service.teaching_brief import (
    apply_proposal_to_brief,
    confirm_teaching_brief,
    load_teaching_brief,
    load_teaching_brief_proposals,
    patch_teaching_brief,
    store_teaching_brief,
)
from services.platform.generation_event_constants import GenerationEventType


async def _persist_teaching_brief(
    *,
    db,
    session,
    new_state: str,
    brief: dict,
    proposals: list[dict],
    append_event,
    event_type: str,
    event_payload: dict,
) -> None:
    next_options = store_teaching_brief(
        getattr(session, "options", None),
        brief=brief,
        proposals=proposals,
    )
    await persist_session_update_and_events(
        db=db,
        schema_version=1,
        session_id=session.id,
        session_data={
            "state": new_state,
            "stateReason": getattr(session, "stateReason", None),
            "options": json.dumps(next_options, ensure_ascii=False),
        },
        events=[
            {
                "event_type": event_type,
                "state": new_state,
                "state_reason": getattr(session, "stateReason", None),
                "progress": getattr(session, "progress", 0),
                "payload": event_payload,
            }
        ],
    )


async def handle_update_teaching_brief_draft(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event,
) -> None:
    brief = patch_teaching_brief(
        getattr(session, "options", None),
        dict(command.get("patch") or {}),
    )
    proposals = load_teaching_brief_proposals(getattr(session, "options", None))
    await _persist_teaching_brief(
        db=db,
        session=session,
        new_state=new_state,
        brief=brief,
        proposals=proposals,
        append_event=append_event,
        event_type=GenerationEventType.STATE_CHANGED.value,
        event_payload={
            "reason": "teaching_brief_updated",
            "teaching_brief": brief,
        },
    )


async def handle_apply_teaching_brief_proposal(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event,
    conflict_error_cls,
) -> None:
    proposals = load_teaching_brief_proposals(getattr(session, "options", None))
    next_proposals, proposal = remove_proposal_by_id(
        proposals, str(command.get("proposal_id") or "")
    )
    if proposal is None:
        raise conflict_error_cls(
            "教学需求候选更新不存在或已失效",
            error_code="RESOURCE_CONFLICT",
        )
    brief = apply_proposal_to_brief(getattr(session, "options", None), proposal)
    await _persist_teaching_brief(
        db=db,
        session=session,
        new_state=new_state,
        brief=brief,
        proposals=next_proposals,
        append_event=append_event,
        event_type=GenerationEventType.STATE_CHANGED.value,
        event_payload={
            "reason": "teaching_brief_proposal_applied",
            "proposal_id": proposal.get("proposal_id"),
            "teaching_brief": brief,
        },
    )


async def handle_dismiss_teaching_brief_proposal(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event,
    conflict_error_cls,
) -> None:
    proposals = load_teaching_brief_proposals(getattr(session, "options", None))
    next_proposals, proposal = remove_proposal_by_id(
        proposals, str(command.get("proposal_id") or "")
    )
    if proposal is None:
        raise conflict_error_cls(
            "教学需求候选更新不存在或已失效",
            error_code="RESOURCE_CONFLICT",
        )
    brief = load_teaching_brief(getattr(session, "options", None))
    await _persist_teaching_brief(
        db=db,
        session=session,
        new_state=new_state,
        brief=brief,
        proposals=next_proposals,
        append_event=append_event,
        event_type=GenerationEventType.STATE_CHANGED.value,
        event_payload={
            "reason": "teaching_brief_proposal_dismissed",
            "proposal_id": proposal.get("proposal_id"),
            "dismissed": True,
        },
    )


async def handle_confirm_teaching_brief(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event,
) -> None:
    patch = dict(command.get("patch") or {})
    base_brief = load_teaching_brief(getattr(session, "options", None))
    if patch:
        base_brief = patch_teaching_brief(
            base_brief,
            patch,
        )
    brief = confirm_teaching_brief(base_brief)
    proposals = load_teaching_brief_proposals(getattr(session, "options", None))
    await _persist_teaching_brief(
        db=db,
        session=session,
        new_state=new_state,
        brief=brief,
        proposals=proposals,
        append_event=append_event,
        event_type=GenerationEventType.STATE_CHANGED.value,
        event_payload={
            "reason": "teaching_brief_reviewed",
            "teaching_brief": brief,
        },
    )
