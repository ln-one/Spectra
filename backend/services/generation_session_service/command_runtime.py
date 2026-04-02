from __future__ import annotations

import json
import time
from typing import Awaitable, Callable

from schemas.generation import build_session_output_fields
from services.courseware_ai.generation_support import retrieve_rag_context
from services.generation_session_service.command_runtime_slide_modify_helpers import (
    extract_rag_source_ids as _extract_rag_source_ids,
)
from services.generation_session_service.command_runtime_slide_modify_helpers import (
    extract_template_config as _extract_template_config,
)
from services.generation_session_service.command_runtime_slide_modify_helpers import (
    persist_modified_pptx_artifact as _persist_modified_pptx_artifact,
)
from services.generation_session_service.command_runtime_slide_modify_helpers import (
    refresh_rendered_preview as _refresh_rendered_preview,
)
from services.generation_session_service.command_runtime_slide_modify_helpers import (
    resolve_target_slide_index as _resolve_target_slide_index,
)
from services.generation_session_service.session_history import (
    RUN_STATUS_PROCESSING,
    RUN_STEP_MODIFY_SLIDE,
    build_run_trace_payload,
    create_session_run,
    serialize_session_run,
    update_session_run,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.preview_helpers import load_preview_content, save_preview_content
from services.preview_helpers.content_generation import (
    parse_preview_content_from_input_data,
)
from services.task_executor.constants import TaskFailureStateReason


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
    session_state_mutated = False
    try:
        if expected_render_version and session.renderVersion != expected_render_version:
            raise conflict_error_cls(
                (
                    f"render version conflict: expected {expected_render_version}, "
                    f"current {session.renderVersion}"
                )
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
        session_state_mutated = True

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
        template_config = _extract_template_config(session=session, task=latest_task)
        next_render_version = int(getattr(session, "renderVersion", 0) or 0) + 1
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
            "style_manifest": preview_content.get("style_manifest"),
            "extra_css": preview_content.get("extra_css"),
            "page_class_plan": preview_content.get("page_class_plan"),
        }
        updated_preview = await _refresh_rendered_preview(
            task=latest_task,
            preview_payload=updated_preview,
            template_config=template_config,
        )
        await _persist_task_preview_content(db, latest_task, updated_preview)
        artifact_id, output_urls = await _persist_modified_pptx_artifact(
            db=db,
            session=session,
            task=latest_task,
            run=run,
            preview_payload=updated_preview,
            template_config=template_config,
            render_version=next_render_version,
        )
        session_data = {
            "state": GenerationState.SUCCESS.value,
            "stateReason": TaskFailureStateReason.COMPLETED.value,
            "progress": 100,
            "errorCode": None,
            "errorMessage": None,
            "errorRetryable": False,
            "resumable": True,
        }
        session_data.update(build_session_output_fields(output_urls))
        if "pptUrl" not in session_data or session_data.get("pptUrl") is None:
            session_data["pptUrl"] = getattr(session, "pptUrl", None)
        if "wordUrl" not in session_data or session_data.get("wordUrl") is None:
            session_data["wordUrl"] = getattr(session, "wordUrl", None)
        await db.generationsession.update(where={"id": session.id}, data=session_data)

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
            artifact_id=artifact_id,
            output_urls=output_urls,
            render_version=next_render_version,
            preview_ready=bool(updated_preview.get("rendered_preview")),
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
            state=GenerationState.SUCCESS.value,
            payload=run_trace_payload,
        )
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.TASK_COMPLETED.value,
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            payload=run_trace_payload,
        )
        await append_event(
            session_id=session.id,
            event_type=GenerationEventType.STATE_CHANGED.value,
            state=GenerationState.SUCCESS.value,
            state_reason=TaskFailureStateReason.COMPLETED.value,
            progress=100,
            payload=run_trace_payload,
        )
        return {
            "run": serialize_session_run(run),
            "slide_id": slide_id,
            "slide_index": target_slide_index,
            "scope": scope,
            "preview_updated": True,
            "artifact_id": artifact_id,
            "render_version": next_render_version,
            "output_urls": output_urls,
            "rendered_preview_ready": bool(updated_preview.get("rendered_preview")),
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
        if run:
            await update_session_run(
                db=db,
                run_id=run.id,
                status="failed",
            )
        if session_state_mutated:
            await db.generationsession.update(
                where={"id": session.id},
                data={
                    "state": GenerationState.SUCCESS.value,
                    "stateReason": TaskFailureStateReason.COMPLETED.value,
                    "progress": 100,
                    "errorCode": None,
                    "errorMessage": None,
                    "errorRetryable": False,
                    "resumable": True,
                },
            )
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
        event_type=GenerationEventType.STATE_CHANGED.value,
        state=new_state,
        state_reason=getattr(session, "stateReason", None),
        payload={"resumed_from_cursor": cursor},
    )
    await append_event(
        session_id=session.id,
        event_type=GenerationEventType.SESSION_RECOVERED.value,
        state=new_state,
        payload={"resumed_from_cursor": cursor},
    )
