from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.generation_session_service.background_tasks import spawn_background_task
from services.generation_session_service.run_artifact_sync import (
    sync_run_title_to_artifact_metadata,
)
from services.generation_session_service.run_constants import (
    PROJECT_TITLE_SOURCE_AUTO,
    PROJECT_TITLE_SOURCE_DEFAULT,
    PROJECT_TITLE_SOURCE_FALLBACK,
    RUN_TITLE_SOURCE_AUTO,
    RUN_TITLE_SOURCE_FALLBACK,
    RUN_TITLE_SOURCE_PENDING,
    SESSION_TITLE_SOURCE_DEFAULT,
    SESSION_TITLE_SOURCE_FALLBACK,
    SESSION_TITLE_SOURCE_FIRST_MESSAGE,
)
from services.generation_session_service.run_lifecycle import (
    supports_session_run,
    update_session_run,
)
from services.generation_session_service.run_serialization import serialize_session_run

from .prompting import (
    PROJECT_TITLE_MAX_LENGTH,
    RUN_TITLE_MAX_LENGTH,
    SESSION_TITLE_MAX_LENGTH,
    build_project_fallback_title,
    build_project_prompt,
    build_run_fallback_title,
    build_run_prompt,
    build_session_fallback_title,
    build_session_prompt,
    clean_title_candidate,
    is_bad_run_title,
    is_generic_title,
)

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def generate_title(prompt: str, *, max_length: int) -> str:
    result = await ai_service.generate(
        prompt,
        route_task=ModelRouteTask.TITLE_POLISH.value,
        max_tokens=40,
    )
    return clean_title_candidate((result or {}).get("content"), max_length=max_length)


async def claim_generation_request(
    *,
    model,
    where: dict,
    eligible: Callable[[Any], bool],
    requested_at_field: str,
) -> bool:
    now = utc_now()
    update_many = getattr(model, "update_many", None)
    if callable(update_many):
        try:
            result = await update_many(
                where={**where, requested_at_field: None},
                data={requested_at_field: now},
            )
            affected = getattr(result, "count", result)
            return int(affected or 0) > 0
        except Exception as exc:
            logger.warning("Title generation claim fallback due to error: %s", exc)

    finder = getattr(model, "find_unique", None)
    updater = getattr(model, "update", None)
    if not callable(finder) or not callable(updater):
        return False
    record = await finder(where=where)
    if not record or not eligible(record):
        return False
    if getattr(record, requested_at_field, None) is not None:
        return False
    await updater(where=where, data={requested_at_field: now})
    return True


def spawn_once(label: str, task_factory: Callable[[], Awaitable[Any]]) -> None:
    spawn_background_task(task_factory(), label=label)


async def request_project_title_generation(
    *,
    db,
    project_id: str,
    description: str,
) -> bool:
    project_model = getattr(db, "project", None)
    if project_model is None:
        return False
    claimed = await claim_generation_request(
        model=project_model,
        where={"id": project_id},
        eligible=lambda record: getattr(record, "nameSource", PROJECT_TITLE_SOURCE_DEFAULT)
        == PROJECT_TITLE_SOURCE_DEFAULT,
        requested_at_field="nameGenerationRequestedAt",
    )
    if not claimed:
        return False
    spawn_once(
        f"project-title:{project_id}",
        lambda: generate_project_title(
            db=db,
            project_id=project_id,
            description=description,
        ),
    )
    return True


async def generate_project_title(*, db, project_id: str, description: str) -> dict | None:
    project = await db.project.find_unique(where={"id": project_id})
    if not project:
        return None
    source = getattr(project, "nameSource", PROJECT_TITLE_SOURCE_DEFAULT)
    if source not in {PROJECT_TITLE_SOURCE_DEFAULT, PROJECT_TITLE_SOURCE_FALLBACK}:
        return None

    fallback_title = build_project_fallback_title(
        description=description,
        project_id=project_id,
    )
    next_source = PROJECT_TITLE_SOURCE_AUTO
    try:
        title = await generate_title(
            build_project_prompt(description),
            max_length=PROJECT_TITLE_MAX_LENGTH,
        )
        if is_generic_title(title):
            title = fallback_title
            next_source = PROJECT_TITLE_SOURCE_FALLBACK
    except Exception as exc:
        logger.warning("Auto project title generation failed: %s", exc)
        title = fallback_title
        next_source = PROJECT_TITLE_SOURCE_FALLBACK

    updated = await db.project.update(
        where={"id": project_id},
        data={
            "name": title,
            "nameSource": next_source,
            "nameUpdatedAt": utc_now(),
        },
    )
    return {
        "name": updated.name,
        "name_source": getattr(updated, "nameSource", None),
        "name_updated_at": (
            updated.nameUpdatedAt.isoformat()
            if getattr(updated, "nameUpdatedAt", None)
            else None
        ),
    }


async def request_session_title_generation(
    *,
    db,
    session_id: str,
    first_message: str,
) -> bool:
    session_model = getattr(db, "generationsession", None)
    if session_model is None:
        return False
    claimed = await claim_generation_request(
        model=session_model,
        where={"id": session_id},
        eligible=lambda record: getattr(
            record, "displayTitleSource", SESSION_TITLE_SOURCE_DEFAULT
        )
        == SESSION_TITLE_SOURCE_DEFAULT,
        requested_at_field="displayTitleGenerationRequestedAt",
    )
    if not claimed:
        return False
    spawn_once(
        f"session-title:{session_id}",
        lambda: generate_session_title(
            db=db,
            session_id=session_id,
            first_message=first_message,
        ),
    )
    return True


async def generate_session_title(
    *,
    db,
    session_id: str,
    first_message: str,
) -> dict | None:
    session = await db.generationsession.find_unique(where={"id": session_id})
    if not session:
        return None
    source = getattr(session, "displayTitleSource", SESSION_TITLE_SOURCE_DEFAULT)
    if source not in {SESSION_TITLE_SOURCE_DEFAULT, SESSION_TITLE_SOURCE_FALLBACK}:
        return None

    fallback_title = build_session_fallback_title(
        first_message=first_message,
        session_id=session_id,
    )
    next_source = SESSION_TITLE_SOURCE_FIRST_MESSAGE
    try:
        title = await generate_title(
            build_session_prompt(first_message),
            max_length=SESSION_TITLE_MAX_LENGTH,
        )
        if is_generic_title(title):
            title = fallback_title
            next_source = SESSION_TITLE_SOURCE_FALLBACK
    except Exception as exc:
        logger.warning("Auto session title generation failed: %s", exc)
        title = fallback_title
        next_source = SESSION_TITLE_SOURCE_FALLBACK

    updated = await db.generationsession.update(
        where={"id": session_id},
        data={
            "displayTitle": title,
            "displayTitleSource": next_source,
            "displayTitleUpdatedAt": utc_now(),
        },
    )
    return {
        "display_title": updated.displayTitle,
        "display_title_source": updated.displayTitleSource,
        "display_title_updated_at": (
            updated.displayTitleUpdatedAt.isoformat()
            if getattr(updated, "displayTitleUpdatedAt", None)
            else None
        ),
    }


async def request_run_title_generation(
    *,
    db,
    run_id: str,
    tool_type: str,
    snapshot: Any = None,
) -> bool:
    if not supports_session_run(db):
        return False
    claimed = await claim_generation_request(
        model=db.sessionrun,
        where={"id": run_id},
        eligible=lambda record: getattr(record, "titleSource", RUN_TITLE_SOURCE_PENDING)
        in {RUN_TITLE_SOURCE_PENDING, RUN_TITLE_SOURCE_FALLBACK},
        requested_at_field="titleGenerationRequestedAt",
    )
    if not claimed:
        return False
    spawn_once(
        f"run-title:{run_id}",
        lambda: generate_run_title(
            db=db,
            run_id=run_id,
            tool_type=tool_type,
            snapshot=snapshot,
        ),
    )
    return True


async def generate_run_title(
    *,
    db,
    run_id: str,
    tool_type: str,
    snapshot: Any = None,
) -> dict | None:
    if not supports_session_run(db):
        return None
    try:
        run = await db.sessionrun.find_unique(where={"id": run_id})
    except Exception as exc:
        logger.warning("Skip semantic run title generation lookup: %s", exc)
        return None
    if not run:
        return None
    if getattr(run, "titleSource", RUN_TITLE_SOURCE_PENDING) not in {
        RUN_TITLE_SOURCE_PENDING,
        RUN_TITLE_SOURCE_FALLBACK,
    }:
        return None

    fallback_title = build_run_fallback_title(
        tool_type=tool_type,
        snapshot=snapshot,
        run_no=getattr(run, "runNo", None),
    )
    next_source = RUN_TITLE_SOURCE_AUTO
    try:
        title = await generate_title(
            build_run_prompt(tool_type, snapshot),
            max_length=RUN_TITLE_MAX_LENGTH,
        )
        if is_generic_title(title) or is_bad_run_title(title):
            title = fallback_title
            next_source = RUN_TITLE_SOURCE_FALLBACK
    except Exception as exc:
        logger.warning("Auto run title generation failed: %s", exc)
        title = fallback_title
        next_source = RUN_TITLE_SOURCE_FALLBACK

    updated = await update_session_run(
        db=db,
        run_id=run_id,
        title=title,
        title_source=next_source,
    )
    await sync_run_title_to_artifact_metadata(db=db, run=updated)
    return serialize_session_run(updated)
