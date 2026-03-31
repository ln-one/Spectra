from __future__ import annotations

import json
import time
from typing import Awaitable, Callable

from schemas.generation import build_session_output_fields
from services.courseware_ai.generation_support import retrieve_rag_context
from services.generation import generation_service
from services.generation.types import CoursewareContent
from services.generation_session_service.session_history import (
    RUN_STATUS_COMPLETED,
    RUN_STATUS_PROCESSING,
    RUN_STEP_COMPLETED,
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
from services.preview_helpers.rendered_preview import build_rendered_preview_payload
from services.preview_helpers.rendering import build_slides
from services.task_executor.constants import TaskFailureStateReason
from services.task_executor.runtime_helpers import build_project_space_download_url
from services.template import TemplateConfig


def _coerce_positive_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 1:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed >= 1 else None
    return None


def _slide_identity(slide, fallback_index: int) -> str:
    value = getattr(slide, "id", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return f"slide-{fallback_index}"


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


def _extract_template_config(*, session, task) -> dict | None:
    def _load_json(raw: object) -> dict:
        if not isinstance(raw, str) or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    session_options = _load_json(getattr(session, "options", None))
    if isinstance(session_options.get("template_config"), dict):
        return session_options.get("template_config")

    task_input = _load_json(getattr(task, "inputData", None))
    if isinstance(task_input.get("template_config"), dict):
        return task_input.get("template_config")

    task_template = _load_json(getattr(task, "templateConfig", None))
    return task_template or None


async def _refresh_rendered_preview(
    *,
    task,
    preview_payload: dict,
    template_config: dict | None,
) -> dict:
    slide_models = build_slides(
        task.id,
        str(preview_payload.get("markdown_content") or ""),
    )
    rendered_preview = await build_rendered_preview_payload(
        task_id=task.id,
        title=str(preview_payload.get("title") or ""),
        markdown_content=str(preview_payload.get("markdown_content") or ""),
        template_config=template_config,
        slide_ids=[
            _slide_identity(slide, index) for index, slide in enumerate(slide_models)
        ],
    )
    next_payload = dict(preview_payload)
    next_payload["rendered_preview"] = rendered_preview
    return next_payload


async def _persist_modified_pptx_artifact(
    *,
    db,
    session,
    task,
    run,
    preview_payload: dict,
    template_config: dict | None,
    render_version: int,
) -> tuple[str | None, dict]:
    markdown_content = str(preview_payload.get("markdown_content") or "").strip()
    if not markdown_content:
        return None, {}
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None or not hasattr(artifact_model, "create"):
        if run:
            await update_session_run(
                db=db,
                run_id=run.id,
                status=RUN_STATUS_COMPLETED,
                step=RUN_STEP_COMPLETED,
            )
        return None, {}

    courseware = CoursewareContent(
        title=str(preview_payload.get("title") or "课件预览"),
        markdown_content=markdown_content,
        lesson_plan_markdown=str(preview_payload.get("lesson_plan_markdown") or ""),
    )
    normalized_template = (
        TemplateConfig(**template_config) if template_config is not None else None
    )
    render_task_id = f"{task.id}-rv{render_version}"
    pptx_path = await generation_service.generate_pptx(
        courseware,
        render_task_id,
        normalized_template,
    )

    artifact = await db.artifact.create(
        data={
            "projectId": session.projectId,
            "type": "pptx",
            "visibility": "private",
            "sessionId": session.id,
            "basedOnVersionId": getattr(session, "baseVersionId", None),
            "ownerUserId": getattr(session, "userId", None),
            "storagePath": pptx_path,
            "metadata": json.dumps(
                {
                    "mode": "modify",
                    "status": "completed",
                    "output_type": "ppt",
                    "title": f"PPTX · slide modify · {render_task_id[:16]}",
                    "task_id": render_task_id,
                    "source_task_id": task.id,
                    "is_current": True,
                    **(serialize_session_run(run) or {}),
                },
                ensure_ascii=False,
            ),
        }
    )
    output_urls = {
        "pptx": build_project_space_download_url(
            project_id=session.projectId,
            artifact_id=artifact.id,
        )
    }
    if run:
        await update_session_run(
            db=db,
            run_id=run.id,
            artifact_id=artifact.id,
            status=RUN_STATUS_COMPLETED,
            step=RUN_STEP_COMPLETED,
        )
    return artifact.id, output_urls


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
