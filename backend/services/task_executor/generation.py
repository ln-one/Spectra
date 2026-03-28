"""Generation task execution workflow."""

import asyncio
import json
import logging
import time
from typing import Optional

from schemas.generation import TaskStatus, normalize_generation_type
from services.generation_session_service.session_history import (
    RUN_STATUS_PROCESSING,
    RUN_STEP_GENERATE,
    update_session_run,
)

from .common import RETRYABLE_ERRORS, run_async_entrypoint
from .generation_error_handling import (
    handle_permanent_error,
    handle_retryable_error,
    handle_unknown_error,
)
from .generation_runtime import GenerationExecutionContext, build_generation_inputs
from .preview_runtime import cache_preview_content, persist_preview_payload
from .runtime_helpers import (
    finalize_generation_success,
    persist_generation_artifacts,
    render_generation_outputs,
)

logger = logging.getLogger(__name__)


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

        ai_started_at = time.perf_counter()
        courseware_content = await build_generation_inputs(db_service, context)
        timings["content_generate_ms"] = round(
            (time.perf_counter() - ai_started_at) * 1000, 2
        )

        cache_started_at = time.perf_counter()
        preview_payload = await cache_preview_content(task_id, courseware_content)
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
        output_urls, artifact_paths, render_timings_ms = (
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

        persist_started_at = time.perf_counter()
        persisted_output_urls = await persist_generation_artifacts(
            db_service=db_service,
            context=context,
            artifact_paths=artifact_paths,
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
