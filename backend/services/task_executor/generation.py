"""Generation task execution workflow."""

import asyncio
import logging
import time
from typing import Optional

from schemas.generation import TaskStatus, normalize_generation_type

from .common import RETRYABLE_ERRORS, run_async_entrypoint
from .generation_error_handling import (
    handle_permanent_error,
    handle_retryable_error,
    handle_unknown_error,
)
from .generation_runtime import (
    GenerationExecutionContext,
    build_generation_inputs,
    cache_preview_content,
    finalize_generation_success,
    persist_generation_artifacts,
    render_generation_outputs,
)

logger = logging.getLogger(__name__)


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

        ai_started_at = time.perf_counter()
        courseware_content = await build_generation_inputs(db_service, context)
        timings["build_inputs_ms"] = round(
            (time.perf_counter() - ai_started_at) * 1000, 2
        )

        cache_started_at = time.perf_counter()
        await cache_preview_content(task_id, courseware_content)
        timings["cache_preview_ms"] = round(
            (time.perf_counter() - cache_started_at) * 1000, 2
        )
        await db_service.update_generation_task_status(
            task_id, TaskStatus.PROCESSING, 30
        )

        render_started_at = time.perf_counter()
        output_urls, artifact_paths = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=courseware_content,
        )
        timings["render_outputs_ms"] = round(
            (time.perf_counter() - render_started_at) * 1000, 2
        )

        persist_started_at = time.perf_counter()
        persisted_output_urls = await persist_generation_artifacts(
            db_service=db_service,
            context=context,
            artifact_paths=artifact_paths,
        )
        timings["persist_artifacts_ms"] = round(
            (time.perf_counter() - persist_started_at) * 1000, 2
        )
        if persisted_output_urls:
            output_urls.update(persisted_output_urls)

        finalize_started_at = time.perf_counter()
        await finalize_generation_success(
            db_service=db_service,
            context=context,
            output_urls=output_urls,
        )
        timings["finalize_ms"] = round(
            (time.perf_counter() - finalize_started_at) * 1000, 2
        )
        logger.info(
            "generation_task_stage_timing task_id=%s session_id=%s timings=%s",
            task_id,
            context.session_id,
            timings,
            extra={
                "task_id": task_id,
                "session_id": context.session_id,
                "timings": timings,
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
