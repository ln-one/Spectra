from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

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
    build_session_fallback_title,
    build_run_fallback_title,
    clean_title_candidate,
    normalize_effective_title,
)
from .structured_prompting import (
    build_project_title_payload,
    build_run_title_payload,
    build_session_title_payload,
)
from .structured_runtime import (
    StructuredTitleResult,
    generate_structured_title,
)

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def generate_title(prompt: str, *, max_length: int) -> str:
    raise RuntimeError(
        "legacy_text_title_generation_removed: use generate_structured_title instead"
    )


def _keep_existing_title(value: Any, *, max_length: int, default_title: str) -> str:
    title = clean_title_candidate(value, max_length=max_length)
    return title or clean_title_candidate(default_title, max_length=max_length)


def _resolve_basis_value(payload: dict[str, Any], basis_key: str) -> str:
    key_facts = payload.get("key_facts")
    if not isinstance(key_facts, dict):
        return ""
    basis_value = key_facts.get(basis_key)
    return str(basis_value or "").strip()


def _validate_structured_title(
    *,
    result: StructuredTitleResult,
    payload: dict[str, Any],
    max_length: int,
    tool_type: str | None = None,
) -> str:
    basis_value = _resolve_basis_value(payload, result.basis_key)
    if not basis_value:
        raise ValueError(f"structured_title_invalid_basis:{result.basis_key}")
    normalized = normalize_effective_title(
        raw_title=result.title,
        basis_value=basis_value,
        scene=result.scene,
        max_length=max_length,
        tool_type=tool_type,
    )
    if not normalized:
        raise ValueError("structured_title_invalid_title")
    return normalized


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

    fallback_title = _keep_existing_title(
        getattr(project, "name", None),
        max_length=PROJECT_TITLE_MAX_LENGTH,
        default_title=build_project_fallback_title(
            description=description,
            project_id=project_id,
        ),
    )
    next_source = PROJECT_TITLE_SOURCE_AUTO
    payload = build_project_title_payload(description)
    try:
        result = await generate_structured_title(
            scene="project",
            payload=payload,
            entity_id=project_id,
        )
        title = _validate_structured_title(
            result=result,
            payload=payload,
            max_length=PROJECT_TITLE_MAX_LENGTH,
        )
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
    project_name: str | None = None,
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
            project_name=project_name,
        ),
    )
    return True


async def generate_session_title(
    *,
    db,
    session_id: str,
    first_message: str,
    project_name: str | None = None,
) -> dict | None:
    session = await db.generationsession.find_unique(where={"id": session_id})
    if not session:
        return None
    source = getattr(session, "displayTitleSource", SESSION_TITLE_SOURCE_DEFAULT)
    if source not in {SESSION_TITLE_SOURCE_DEFAULT, SESSION_TITLE_SOURCE_FALLBACK}:
        return None

    fallback_title = _keep_existing_title(
        getattr(session, "displayTitle", None),
        max_length=SESSION_TITLE_MAX_LENGTH,
        default_title=build_session_fallback_title(
            first_message=first_message,
            session_id=session_id,
        ),
    )
    next_source = SESSION_TITLE_SOURCE_FIRST_MESSAGE
    payload = build_session_title_payload(first_message, project_name=project_name)
    try:
        result = await generate_structured_title(
            scene="session",
            payload=payload,
            entity_id=session_id,
        )
        title = _validate_structured_title(
            result=result,
            payload=payload,
            max_length=SESSION_TITLE_MAX_LENGTH,
        )
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

    fallback_title = _keep_existing_title(
        getattr(run, "title", None),
        max_length=RUN_TITLE_MAX_LENGTH,
        default_title=build_run_fallback_title(
            tool_type=tool_type,
            snapshot=snapshot,
            run_no=getattr(run, "runNo", None),
        ),
    )
    next_source = RUN_TITLE_SOURCE_AUTO
    payload = build_run_title_payload(tool_type, snapshot)
    try:
        result = await generate_structured_title(
            scene="run",
            payload=payload,
            entity_id=run_id,
        )
        title = _validate_structured_title(
            result=result,
            payload=payload,
            max_length=RUN_TITLE_MAX_LENGTH,
            tool_type=tool_type,
        )
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
