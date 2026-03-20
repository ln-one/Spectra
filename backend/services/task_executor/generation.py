"""Generation task execution workflow."""

import asyncio
import logging
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

        courseware_content = await build_generation_inputs(db_service, context)
        await cache_preview_content(task_id, courseware_content)
        await db_service.update_generation_task_status(
            task_id, TaskStatus.PROCESSING, 30
        )

        output_urls = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=courseware_content,
        )
        await finalize_generation_success(
            db_service=db_service,
            context=context,
            output_urls=output_urls,
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
