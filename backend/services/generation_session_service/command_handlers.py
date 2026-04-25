from __future__ import annotations

from typing import Awaitable, Callable, Optional

from services.generation_session_service.command_runtime import handle_regenerate_slide
from services.generation_session_service.outline_command_handlers import (
    handle_confirm_outline,
    handle_redraft_outline,
    handle_set_session_title,
    handle_update_outline,
)
from services.generation_session_service.session_state_runtime import (
    handle_resume_session,
)
from services.generation_session_service.teaching_brief_command_handlers import (
    handle_apply_teaching_brief_proposal,
    handle_confirm_teaching_brief,
    handle_dismiss_teaching_brief_proposal,
    handle_update_teaching_brief_draft,
)
from services.platform.state_transition_guard import GenerationCommandType


async def dispatch_command(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> Optional[dict]:
    """Execute command-specific persistence and event updates."""
    command_type = command.get("command_type")

    if command_type == GenerationCommandType.UPDATE_OUTLINE.value:
        await handle_update_outline(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
        return None
    if command_type == GenerationCommandType.REDRAFT_OUTLINE.value:
        return await handle_redraft_outline(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
    if command_type == GenerationCommandType.CONFIRM_OUTLINE.value:
        return await handle_confirm_outline(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
    if command_type == GenerationCommandType.UPDATE_TEACHING_BRIEF_DRAFT.value:
        await handle_update_teaching_brief_draft(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
        )
        return None
    if command_type == GenerationCommandType.APPLY_TEACHING_BRIEF_PROPOSAL.value:
        await handle_apply_teaching_brief_proposal(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
        return None
    if command_type == GenerationCommandType.DISMISS_TEACHING_BRIEF_PROPOSAL.value:
        await handle_dismiss_teaching_brief_proposal(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
        return None
    if command_type == GenerationCommandType.CONFIRM_TEACHING_BRIEF.value:
        await handle_confirm_teaching_brief(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
        )
        return None
    if command_type == GenerationCommandType.REGENERATE_SLIDE.value:
        return await handle_regenerate_slide(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
            conflict_error_cls=conflict_error_cls,
        )
    if command_type == GenerationCommandType.RESUME_SESSION.value:
        await handle_resume_session(
            db=db,
            session=session,
            command=command,
            new_state=new_state,
            append_event=append_event,
        )
        return None
    if command_type == GenerationCommandType.SET_SESSION_TITLE.value:
        await handle_set_session_title(
            db=db,
            session=session,
            command=command,
        )
        return None

    raise ValueError(f"Unhandled command type: {command_type}")
