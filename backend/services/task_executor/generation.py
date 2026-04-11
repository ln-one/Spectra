"""Generation task execution workflow."""

import asyncio
import json
import logging
import time
from typing import Optional

from schemas.generation import TaskStatus, normalize_generation_type
from services.generation_session_service.event_store import append_event
from services.generation_session_service.session_history import (
    RUN_STATUS_PROCESSING,
    RUN_STEP_GENERATE,
    build_run_trace_payload,
    update_session_run,
)
from services.platform.generation_event_constants import GenerationEventType
from services.platform.state_transition_guard import GenerationState
from services.preview_helpers import save_preview_content
from services.preview_helpers.content_generation import build_outline_preview_payload
from services.render_engine_adapter import build_render_engine_input

from .common import RETRYABLE_ERRORS, run_async_entrypoint
from .generation_error_handling import (
    handle_permanent_error,
    handle_retryable_error,
    handle_unknown_error,
)
from .generation_runtime import GenerationExecutionContext, build_generation_inputs
from .preview_runtime import cache_preview_content, persist_preview_payload
from .requirements import load_session_outline
from .runtime_helpers import (
    finalize_generation_success,
    persist_generation_artifacts,
    render_generation_outputs,
)

logger = logging.getLogger(__name__)


def _build_initial_stream_preview_payload(
    *,
    project_name: str,
    outline_document: Optional[dict],
) -> Optional[dict]:
    outline_preview = build_outline_preview_payload(project_name, outline_document)
    if not outline_preview:
        return None

    preview_payload = dict(outline_preview)
    preview_payload["rendered_preview"] = {
        "format": "png",
        "pages": [],
        "page_count": 0,
    }
    return preview_payload


def _preview_cache_keys_for_context(context: GenerationExecutionContext) -> list[str]:
    keys: list[str] = []
    run_id = str(getattr(context, "run_id", "") or "").strip()
    if run_id:
        keys.append(run_id)
    return keys


def _validate_required_output_urls(
    *,
    task_type: str,
    output_urls: dict,
) -> None:
    normalized_task_type = normalize_generation_type(task_type).value
    missing_outputs: list[str] = []
    if normalized_task_type in {"pptx", "both"} and not output_urls.get("pptx"):
        missing_outputs.append("pptx")
    if normalized_task_type in {"docx", "both"} and not output_urls.get("docx"):
        missing_outputs.append("docx")
    if missing_outputs:
        raise ValueError(
            "Missing required persisted generation outputs: "
            + ", ".join(missing_outputs)
        )


def run_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    """Sync wrapper for RQ workers."""
    normalized_task_type = normalize_generation_type(task_type).value
    run_async_entrypoint(
        lambda: execute_generation_task(
            task_id=task_id,
            project_id=project_id,
            task_type=normalized_task_type,
            template_config=template_config,
        )
    )


async def execute_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    from services.database import DatabaseService

    normalized_task_type = normalize_generation_type(task_type).value

    context = GenerationExecutionContext(
        task_id=task_id,
        project_id=project_id,
        task_type=normalized_task_type,
        template_config=template_config,
    )
    db_service = DatabaseService()
    db_connected = False
    timings: dict[str, float] = {}

    def _run_trace_payload(**extra) -> dict:
        return build_run_trace_payload(
            (
                {
                    "run_id": context.run_id,
                    "run_no": context.run_no,
                    "run_title": context.run_title,
                    "tool_type": context.tool_type,
                }
                if context.run_id
                else None
            ),
            task_id=task_id,
            **extra,
        )

    async def _append_stream_event(
        *,
        event_type: str,
        state_reason: str,
        payload: Optional[dict] = None,
    ) -> None:
        if not context.session_id:
            return
        try:
            await append_event(
                db=db_service.db,
                schema_version=1,
                session_id=context.session_id,
                event_type=event_type,
                state=GenerationState.RENDERING.value,
                state_reason=state_reason,
                payload=payload,
            )
        except Exception as event_err:
            logger.warning(
                "Failed to append stream event: task=%s event=%s error=%s",
                task_id,
                event_type,
                event_err,
            )

    try:
        await asyncio.wait_for(db_service.connect(), timeout=10)
        db_connected = True

        logger.info(
            "generation_task_processing_started",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "task_type": normalized_task_type,
            },
        )

        await db_service.update_generation_task_status(
            task_id=task_id,
            status=TaskStatus.PROCESSING,
            progress=10,
        )
        task_record = await db_service.get_generation_task(task_id)
        context.session_id = getattr(task_record, "sessionId", None)
        input_data_raw = getattr(task_record, "inputData", None)
        if input_data_raw:
            try:
                parsed_input = json.loads(input_data_raw)
            except (TypeError, json.JSONDecodeError):
                parsed_input = {}
            if isinstance(parsed_input, dict):
                context.run_id = parsed_input.get("run_id")
                context.run_no = parsed_input.get("run_no")
                context.run_title = parsed_input.get("run_title")
                context.tool_type = parsed_input.get("tool_type")
                context.retrieval_mode = parsed_input.get("retrieval_mode")
                context.policy_version = parsed_input.get("policy_version")
                context.baseline_id = parsed_input.get("baseline_id")
                outline_version = parsed_input.get("outline_version")
                if isinstance(outline_version, bool):
                    outline_version = None
                if outline_version is not None:
                    try:
                        parsed_outline_version = int(outline_version)
                    except (TypeError, ValueError):
                        parsed_outline_version = None
                    if parsed_outline_version and parsed_outline_version >= 1:
                        context.outline_version = parsed_outline_version

        if context.run_id:
            await update_session_run(
                db=db_service.db,
                run_id=context.run_id,
                status=RUN_STATUS_PROCESSING,
                step=RUN_STEP_GENERATE,
            )

        project = await db_service.get_project(project_id)
        outline_document, _outline_version = await load_session_outline(
            db_service,
            session_id=context.session_id,
            outline_version=context.outline_version,
        )
        initial_preview_payload = _build_initial_stream_preview_payload(
            project_name=(getattr(project, "name", None) or "PPT Streaming Workbench"),
            outline_document=outline_document,
        )
        if initial_preview_payload:
            try:
                for cache_key in [task_id, *_preview_cache_keys_for_context(context)]:
                    await save_preview_content(cache_key, initial_preview_payload)
            except Exception as cache_err:
                logger.warning(
                    "Failed to save initial outline preview cache for task %s: %s",
                    task_id,
                    cache_err,
                )
            await persist_preview_payload(
                db_service,
                task_id=task_id,
                preview_payload=initial_preview_payload,
            )
            await _append_stream_event(
                event_type=GenerationEventType.PPT_STARTED.value,
                state_reason="outline_preview_ready",
                payload=_run_trace_payload(
                    stage="outline_preview_ready",
                    markdown_ready=True,
                    page_count=0,
                ),
            )

        ai_started_at = time.perf_counter()
        courseware_content = await build_generation_inputs(db_service, context)
        timings["content_generate_ms"] = round(
            (time.perf_counter() - ai_started_at) * 1000, 2
        )

        try:
            structured_payload = build_render_engine_input(
                courseware_content,
                (
                    context.template_config
                    if isinstance(context.template_config, dict)
                    else {}
                ),
                ["preview"],
                render_job_id=task_id,
            )
            document_payload = structured_payload.get("document") or {}
            structured_pages = document_payload.get("pages") or []
            await _append_stream_event(
                event_type=GenerationEventType.SLIDES_STARTED.value,
                state_reason="slides_stream_started",
                payload=_run_trace_payload(
                    stage="slides_stream_started",
                    total_slides=len(structured_pages),
                    partial=True,
                    final=False,
                ),
            )
            for index, page_payload in enumerate(structured_pages):
                if not isinstance(page_payload, dict):
                    continue
                slide_id = f"{task_id}-slide-{index}"
                await _append_stream_event(
                    event_type=GenerationEventType.SLIDE_GENERATING.value,
                    state_reason="slide_generating",
                    payload=_run_trace_payload(
                        stage="slide_generating",
                        slide_id=slide_id,
                        slide_index=index,
                        partial=True,
                        final=False,
                    ),
                )
                await _append_stream_event(
                    event_type=GenerationEventType.SLIDE_GENERATED.value,
                    state_reason="slide_generated",
                    payload=_run_trace_payload(
                        stage="slide_generated",
                        slide_id=slide_id,
                        slide_index=index,
                        partial=True,
                        final=False,
                    ),
                )
            await _append_stream_event(
                event_type=GenerationEventType.SLIDES_COMPLETED.value,
                state_reason="slides_stream_completed",
                payload=_run_trace_payload(
                    stage="slides_stream_completed",
                    total_slides=len(structured_pages),
                    partial=False,
                    final=True,
                ),
            )
        except Exception as stream_err:
            logger.warning(
                "Failed to emit structured slide stream events for task %s: %s",
                task_id,
                stream_err,
            )

        cache_started_at = time.perf_counter()

        async def _on_slide_rendered(payload: dict) -> None:
            await _append_stream_event(
                event_type="slide.preview_ready",
                state_reason="page_preview_ready",
                payload=_run_trace_payload(
                    stage="page_preview_ready",
                    **payload,
                ),
            )
            await _append_stream_event(
                event_type=GenerationEventType.PPT_SLIDE_GENERATED.value,
                state_reason="preview_slide_rendered",
                payload=_run_trace_payload(
                    stage="preview_slide_rendered",
                    **payload,
                ),
            )

        async def _on_preview_payload_updated(payload: dict) -> None:
            await persist_preview_payload(
                db_service,
                task_id=task_id,
                preview_payload=payload,
            )

        preview_payload = await cache_preview_content(
            task_id,
            courseware_content,
            template_config=context.template_config,
            on_slide_rendered=_on_slide_rendered if context.session_id else None,
            on_preview_payload_updated=(
                _on_preview_payload_updated if context.session_id else None
            ),
            cache_keys=_preview_cache_keys_for_context(context),
        )
        await _append_stream_event(
            event_type=GenerationEventType.PPT_COMPLETED.value,
            state_reason="preview_render_completed",
            payload=_run_trace_payload(
                stage="preview_render_completed",
                page_count=(
                    (preview_payload.get("rendered_preview") or {}).get("page_count")
                    if isinstance(preview_payload, dict)
                    else None
                ),
            ),
        )
        await persist_preview_payload(
            db_service,
            task_id=task_id,
            preview_payload=preview_payload,
        )
        timings["persist_preview_ms"] = round(
            (time.perf_counter() - cache_started_at) * 1000, 2
        )
        await db_service.update_generation_task_status(
            task_id, TaskStatus.PROCESSING, 30
        )

        render_started_at = time.perf_counter()
        output_urls, artifact_paths, render_timings_ms, render_metadata = (
            await render_generation_outputs(
                db_service=db_service,
                context=context,
                courseware_content=courseware_content,
            )
        )
        timings.update(render_timings_ms)
        timings["render_total_ms"] = round(
            (time.perf_counter() - render_started_at) * 1000,
            2,
        )
        resolved_markdown_content = render_metadata.get("resolved_markdown_content")
        if (
            isinstance(preview_payload, dict)
            and isinstance(resolved_markdown_content, str)
            and resolved_markdown_content.strip()
        ):
            preview_payload["resolved_markdown_content"] = resolved_markdown_content
            resolved_markdown_path = render_metadata.get("resolved_markdown_path")
            if (
                isinstance(resolved_markdown_path, str)
                and resolved_markdown_path.strip()
            ):
                preview_payload["resolved_markdown_path"] = resolved_markdown_path
            try:
                for cache_key in [task_id, *_preview_cache_keys_for_context(context)]:
                    await save_preview_content(cache_key, preview_payload)
            except Exception as cache_err:
                logger.warning(
                    "Failed to refresh resolved markdown preview cache for task %s: %s",
                    task_id,
                    cache_err,
                )
            await persist_preview_payload(
                db_service,
                task_id=task_id,
                preview_payload=preview_payload,
            )

        persist_started_at = time.perf_counter()
        persisted_output_urls = await persist_generation_artifacts(
            db_service=db_service,
            context=context,
            artifact_paths=artifact_paths,
            courseware_content=courseware_content,
        )
        timings["persist_artifact_ms"] = round(
            (time.perf_counter() - persist_started_at) * 1000, 2
        )
        if persisted_output_urls:
            output_urls.update(persisted_output_urls)
        _validate_required_output_urls(
            task_type=normalized_task_type,
            output_urls=output_urls,
        )

        finalize_started_at = time.perf_counter()
        await finalize_generation_success(
            db_service=db_service,
            context=context,
            output_urls=output_urls,
            payload_extra={
                "stage_timings_ms": timings,
                "output_urls": output_urls,
            },
        )
        timings["terminal_state_sync_ms"] = round(
            (time.perf_counter() - finalize_started_at) * 1000, 2
        )
        logger.info(
            "generation_task_stage_timing",
            extra={
                "task_id": task_id,
                "session_id": context.session_id,
                "timings": timings,
                "output_urls": output_urls,
                "stage_timings_json": json.dumps(timings, ensure_ascii=False),
            },
        )

    except RETRYABLE_ERRORS as exc:
        await handle_retryable_error(db_service, context, exc)
        raise

    except (ValueError, KeyError, TypeError) as exc:
        await handle_permanent_error(db_service, context, exc)

    except Exception as exc:
        await handle_unknown_error(db_service, context, exc)

    finally:
        if db_connected:
            try:
                await asyncio.wait_for(db_service.disconnect(), timeout=5)
            except asyncio.TimeoutError:
                logger.warning(
                    "Database disconnect timed out in task %s; continue anyway",
                    task_id,
                )
            except Exception as exc:
                logger.warning(
                    "Failed to disconnect database in task %s: %s", task_id, exc
                )
