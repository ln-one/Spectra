"""Generation task execution workflow."""

import asyncio
import json
import logging
import time
from typing import Optional

from .common import RETRYABLE_ERRORS, run_async_entrypoint, sync_session_terminal_state
from .requirements import build_user_requirements, load_session_outline

logger = logging.getLogger(__name__)


def run_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    """Sync wrapper for RQ workers."""
    run_async_entrypoint(
        lambda: execute_generation_task(
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
        )
    )


async def execute_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    from services import task_executor as task_executor_module
    from services.database import DatabaseService

    start_time = time.time()
    db_service = DatabaseService()
    db_connected = False
    session_id: Optional[str] = None

    try:
        await asyncio.wait_for(db_service.connect(), timeout=10)
        db_connected = True

        logger.info(
            "generation_task_processing_started",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "task_type": task_type,
                "timestamp": time.time(),
            },
        )

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="processing",
            progress=10,
        )
        task_record = await db_service.get_generation_task(task_id)
        session_id = getattr(task_record, "sessionId", None)

        from services.ai import ai_service
        from services.template import TemplateConfig

        logger.info(
            "Calling AI service to generate courseware content for task %s", task_id
        )

        user_requirements = await build_user_requirements(
            db_service,
            project_id,
            session_id=session_id,
        )
        outline_document, outline_version = await load_session_outline(
            db_service,
            session_id=session_id,
        )

        courseware_content = await ai_service.generate_courseware_content(
            project_id=project_id,
            user_requirements=user_requirements,
            template_style=(
                template_config.get("style", "default")
                if template_config
                else "default"
            ),
            outline_document=outline_document,
            outline_version=outline_version,
        )

        try:
            from services.preview_helpers import save_preview_content

            await save_preview_content(
                task_id,
                {
                    "title": courseware_content.title,
                    "markdown_content": courseware_content.markdown_content,
                    "lesson_plan_markdown": courseware_content.lesson_plan_markdown,
                },
            )
        except Exception as cache_err:
            logger.warning(
                "Failed to save preview cache for task %s: %s", task_id, cache_err
            )

        await db_service.update_generation_task_status(task_id, "processing", 30)

        from services.generation import generation_service

        tpl_config = (
            TemplateConfig(**template_config) if template_config else TemplateConfig()
        )
        output_urls = {}
        export_endpoint = (
            f"/api/v1/generate/sessions/{session_id}/preview/export"
            if session_id
            else None
        )

        if task_type in ["pptx", "both"]:
            logger.info("Generating PPTX for task %s", task_id)
            pptx_path = await generation_service.generate_pptx(
                courseware_content, task_id, tpl_config
            )
            logger.info("PPTX generated: %s", pptx_path)
            output_urls["pptx"] = export_endpoint or pptx_path
            await db_service.update_generation_task_status(task_id, "processing", 60)

        if task_type in ["docx", "both"]:
            logger.info("Generating DOCX for task %s", task_id)
            docx_path = await generation_service.generate_docx(
                courseware_content, task_id, tpl_config
            )
            logger.info("DOCX generated: %s", docx_path)
            output_urls["docx"] = export_endpoint or docx_path
            await db_service.update_generation_task_status(task_id, "processing", 90)

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="completed",
            progress=100,
            output_urls=json.dumps(output_urls),
        )

        try:
            await sync_session_terminal_state(
                db_service=db_service,
                task_id=task_id,
                session_id=session_id,
                state="SUCCESS",
                state_reason="task_completed",
                output_urls=output_urls,
            )
            if session_id:
                logger.info(
                    "session_state_updated_to_success",
                    extra={
                        "session_id": session_id,
                        "task_id": task_id,
                        "timestamp": time.time(),
                    },
                )
        except Exception as sync_err:
            logger.error(
                "failed_to_sync_session_success_state "
                "task_id=%s session_id=%s error=%s",
                task_id,
                session_id,
                sync_err,
                exc_info=True,
            )

        logger.info(
            "generation_task_completed",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "output_urls": output_urls,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
        )

    except RETRYABLE_ERRORS as exc:
        logger.warning(
            "Retryable error in task %s: %s: %s",
            task_id,
            type(exc).__name__,
            str(exc),
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "error_type": type(exc).__name__,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
        )

        try:
            await db_service.increment_task_retry_count(task_id)
        except Exception as db_error:
            logger.error("Failed to increment retry count: %s", db_error)

        retries_left = 0
        try:
            current_job = task_executor_module.get_current_job()
            retries_left = current_job.retries_left if current_job else 0
        except Exception as job_err:
            logger.error(
                "Could not determine retries_left for task %s: %s",
                task_id,
                job_err,
            )

        if retries_left <= 0:
            error_msg = f"{type(exc).__name__}: {str(exc)}"
            await db_service.update_generation_task_status(
                task_id=task_id,
                status="failed",
                error_message=error_msg,
            )
            try:
                await sync_session_terminal_state(
                    db_service=db_service,
                    task_id=task_id,
                    session_id=session_id,
                    state="FAILED",
                    state_reason="task_failed_retry_exhausted",
                    error_message=error_msg,
                    retryable=True,
                )
            except Exception as sync_err:
                logger.error(
                    "failed_to_sync_session_failed_state "
                    "task_id=%s session_id=%s error=%s",
                    task_id,
                    session_id,
                    sync_err,
                    exc_info=True,
                )

        raise

    except (ValueError, KeyError, TypeError) as exc:
        logger.error(
            "Permanent error in task %s: %s: %s",
            task_id,
            type(exc).__name__,
            str(exc),
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "error_type": type(exc).__name__,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
            exc_info=True,
        )

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=f"{type(exc).__name__}: {str(exc)}",
        )
        try:
            await sync_session_terminal_state(
                db_service=db_service,
                task_id=task_id,
                session_id=session_id,
                state="FAILED",
                state_reason="task_failed_permanent_error",
                error_message=f"{type(exc).__name__}: {str(exc)}",
                retryable=False,
            )
        except Exception as sync_err:
            logger.error(
                "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
                task_id,
                session_id,
                sync_err,
                exc_info=True,
            )

    except Exception as exc:
        logger.error(
            "Unknown error in task %s: %s: %s",
            task_id,
            type(exc).__name__,
            str(exc),
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "error_type": type(exc).__name__,
                "execution_time": time.time() - start_time,
                "timestamp": time.time(),
            },
            exc_info=True,
        )

        retries_left = 0
        try:
            current_job = task_executor_module.get_current_job()
            retries_left = current_job.retries_left if current_job else 0
        except Exception as job_err:
            logger.error(
                "Could not determine retries_left for task %s: %s; "
                "treating as retries exhausted",
                task_id,
                job_err,
            )

        if retries_left > 0:
            try:
                await db_service.increment_task_retry_count(task_id)
            except Exception as db_error:
                logger.error("Failed to increment retry count: %s", db_error)
            raise

        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=f"{type(exc).__name__}: {str(exc)}",
        )
        try:
            await sync_session_terminal_state(
                db_service=db_service,
                task_id=task_id,
                session_id=session_id,
                state="FAILED",
                state_reason="task_failed_unknown_error",
                error_message=f"{type(exc).__name__}: {str(exc)}",
                retryable=True,
            )
        except Exception as sync_err:
            logger.error(
                "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
                task_id,
                session_id,
                sync_err,
                exc_info=True,
            )

        raise

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
