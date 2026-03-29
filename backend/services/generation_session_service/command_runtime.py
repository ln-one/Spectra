from __future__ import annotations

import json
import time
from typing import Awaitable, Callable

from services.courseware_ai.generation_support import retrieve_rag_context
from services.generation_session_service.session_history import (
    RUN_STATUS_PROCESSING,
    RUN_STEP_MODIFY_SLIDE,
    build_run_trace_payload,
    create_session_run,
    serialize_session_run,
)
from services.platform.generation_event_constants import GenerationEventType
from services.preview_helpers import load_preview_content, save_preview_content
from services.preview_helpers.content_generation import (
    parse_preview_content_from_input_data,
)


def _coerce_positive_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


async def _load_latest_session_task(db, session_id: str):
    task_model = getattr(db, "generationtask", None)
    if task_model is None or not hasattr(task_model, "find_first"):
        return None
    return await task_model.find_first(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
    )


async def _load_task_preview_content(task) -> dict | None:
    if not task:
        return None
    task_id = str(getattr(task, "id", "") or "").strip()
    if task_id:
        cached = await load_preview_content(task_id)
        if isinstance(cached, dict):
            return cached
    return parse_preview_content_from_input_data(getattr(task, "inputData", None))


async def _persist_task_preview_content(db, task, preview_payload: dict) -> None:
    if not task:
        return
    task_id = str(getattr(task, "id", "") or "").strip()
    if task_id:
        await save_preview_content(task_id, preview_payload)

    raw_input_data = getattr(task, "inputData", None)
    merged_input: dict = {}
    if isinstance(raw_input_data, str) and raw_input_data.strip():
        try:
            parsed = json.loads(raw_input_data)
        except (TypeError, json.JSONDecodeError):
            parsed = None
        if isinstance(parsed, dict):
            merged_input.update(parsed)
    merged_input["preview_content"] = preview_payload
    merged_input["preview_cached_at"] = int(time.time())
    await db.generationtask.update(
        where={"id": task.id},
        data={"inputData": json.dumps(merged_input, ensure_ascii=False)},
    )


def _resolve_target_slide_index(command: dict) -> int | None:
    from services.preview_helpers import build_slides

    slide_index = _coerce_positive_int(command.get("slide_index"))
    if slide_index is not None:
        return slide_index

    slide_id = str(command.get("slide_id") or "").strip()
    if not slide_id:
        return None
    markdown_content = str(command.get("_preview_markdown_content") or "")
    if not markdown_content.strip():
        return None

    slides = build_slides("preview", markdown_content)
    for slide in slides:
        if str(getattr(slide, "id", "") or "").strip() == slide_id:
            resolved = int(getattr(slide, "index", -1)) + 1
            return resolved if resolved >= 1 else None
    return None


def _extract_rag_source_ids(*, session, task) -> list[str]:
    source_ids: list[str] = []

    def _merge(raw_value: object) -> None:
        if not isinstance(raw_value, list):
            return
        for item in raw_value:
            normalized = str(item or "").strip()
            if normalized and normalized not in source_ids:
                source_ids.append(normalized)

    options_raw = getattr(session, "options", None)
    if isinstance(options_raw, str) and options_raw.strip():
        try:
            options = json.loads(options_raw)
        except (TypeError, json.JSONDecodeError):
            options = None
        if isinstance(options, dict):
            _merge(options.get("rag_source_ids"))
            template_config = (
                options.get("template_config")
                if isinstance(options.get("template_config"), dict)
                else {}
            )
            _merge(template_config.get("rag_source_ids"))

    input_data_raw = getattr(task, "inputData", None)
    if isinstance(input_data_raw, str) and input_data_raw.strip():
        try:
            input_data = json.loads(input_data_raw)
        except (TypeError, json.JSONDecodeError):
            input_data = None
        if isinstance(input_data, dict):
            _merge(input_data.get("rag_source_ids"))
            template_config = (
                input_data.get("template_config")
                if isinstance(input_data.get("template_config"), dict)
                else {}
            )
            _merge(template_config.get("rag_source_ids"))

    return source_ids


async def handle_regenerate_slide(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
    conflict_error_cls,
) -> dict:
    from services.ai import ai_service

    slide_id = command.get("slide_id")
    patch = command.get("patch", {})
    instruction = str(command.get("instruction") or "").strip()
    scope = str(command.get("scope") or "current_slide_only").strip()
    expected_render_version = command.get("expected_render_version")
    preserve_style = bool(command.get("preserve_style", True))
    preserve_layout = bool(command.get("preserve_layout", True))
    preserve_deck_consistency = bool(command.get("preserve_deck_consistency", True))
    slide_index = command.get("slide_index")

    run = None
    run_trace_payload = {}
    try:
        if expected_render_version and session.renderVersion != expected_render_version:
            raise conflict_error_cls(
                (
                    f"render version conflict: expected {expected_render_version}, "
                    f"current {session.renderVersion}"
                )
            )

        run = await create_session_run(
            db=db,
            session_id=session.id,
            project_id=session.projectId,
            tool_type="slide_modify",
            step=RUN_STEP_MODIFY_SLIDE,
            status=RUN_STATUS_PROCESSING,
        )
        await db.generationsession.update(
            where={"id": session.id},
            data={"state": new_state, "renderVersion": {"increment": 1}},
        )
        latest_task = await _load_latest_session_task(db, session.id)
        preview_content = await _load_task_preview_content(latest_task)
        if not preview_content:
            raise conflict_error_cls("preview content is missing for this session")

        markdown_content = str(preview_content.get("markdown_content") or "").strip()
        if not markdown_content:
            raise conflict_error_cls("preview markdown is empty")

        command["_preview_markdown_content"] = markdown_content
        target_slide_index = _resolve_target_slide_index(command)
        if target_slide_index is None:
            raise conflict_error_cls("failed to resolve target slide index")

        rag_source_ids = _extract_rag_source_ids(session=session, task=latest_task)
        rag_context = None
        source_scope = "no_source_constraint"
        if rag_source_ids:
            rag_context = await retrieve_rag_context(
                ai_service,
                session.projectId,
                instruction or f"slide-{target_slide_index}-modify",
                top_k=8,
                session_id=session.id,
                filters={"file_ids": rag_source_ids},
            )
            source_scope = "selected_files"
            if not rag_context:
                rag_context = await retrieve_rag_context(
                    ai_service,
                    session.projectId,
                    instruction or f"slide-{target_slide_index}-modify",
                    top_k=8,
                    session_id=session.id,
                    filters=None,
                )
                source_scope = "project_kb_fallback"

        modified = await ai_service.modify_courseware(
            current_content=markdown_content,
            instruction=instruction,
            target_slides=[target_slide_index],
            rag_context=rag_context,
            strict_source_mode=bool(rag_context),
        )
        updated_preview = {
            "title": str(
                preview_content.get("title") or getattr(modified, "title", "")
            ),
            "markdown_content": str(
                getattr(modified, "markdown_content", "") or markdown_content
            ),
            "lesson_plan_markdown": str(
                getattr(modified, "lesson_plan_markdown", "")
                or preview_content.get("lesson_plan_markdown")
                or ""
            ),
        }
        await _persist_task_preview_content(db, latest_task, updated_preview)

        run_trace_payload = build_run_trace_payload(
            run,
            slide_id=slide_id,
            slide_index=target_slide_index,
            instruction=instruction,
            scope=scope,
            preserve_style=preserve_style,
            preserve_layout=preserve_layout,
            preserve_deck_consistency=preserve_deck_consistency,
            patch_schema_version=patch.get("schema_version", 1),
        )
        await append_event(
            session_id=session.id,
            event_type="slide.modify.started",
            state=new_state,
            payload=run_trace_payload,
        )
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.SLIDE_MODIFY_PROCESSING.value,
            state=new_state,
            payload=run_trace_payload,
        )
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.SLIDE_UPDATED.value,
            state=new_state,
            payload=run_trace_payload,
        )
        return {
            "run": serialize_session_run(run),
            "slide_id": slide_id,
            "slide_index": target_slide_index,
            "scope": scope,
            "preview_updated": True,
            "source_bound": bool(rag_source_ids),
            "source_chunk_count": len(rag_context or []),
            "source_scope": source_scope,
        }
    except Exception as exc:
        failure_payload = (
            dict(run_trace_payload)
            if run_trace_payload
            else build_run_trace_payload(
                run,
                slide_id=slide_id,
                slide_index=slide_index,
                instruction=instruction,
                scope=scope,
                preserve_style=preserve_style,
                preserve_layout=preserve_layout,
                preserve_deck_consistency=preserve_deck_consistency,
                patch_schema_version=patch.get("schema_version", 1),
            )
        )
        failure_payload["error_message"] = str(exc)
        failure_payload["failure_type"] = type(exc).__name__
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.SLIDE_MODIFY_FAILED.value,
            state=new_state,
            payload=failure_payload,
        )
        raise


async def handle_resume_session(
    *,
    db,
    session,
    command: dict,
    new_state: str,
    append_event: Callable[..., Awaitable[None]],
) -> None:
    cursor = command.get("cursor")
    await db.generationsession.update(
        where={"id": session.id},
        data={
            "state": new_state,
            "resumable": True,
            "lastCursor": cursor,
            "errorCode": None,
            "errorMessage": None,
        },
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.SESSION_RECOVERED.value,
        state=new_state,
        payload={"resumed_from_cursor": cursor},
    )
