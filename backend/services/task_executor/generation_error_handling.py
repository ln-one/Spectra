"""Error handling helpers for generation tasks."""

from __future__ import annotations

import asyncio
import logging
import time

from schemas.generation import TaskStatus

from .common import sync_session_terminal_state
from .constants import TaskExecutionErrorCode, TaskFailureStateReason

logger = logging.getLogger(__name__)


def _classify_generation_error(exc) -> tuple[str, str]:
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return TaskExecutionErrorCode.TIMEOUT.value, "生成任务执行超时"
    return TaskExecutionErrorCode.FAILED.value, f"{type(exc).__name__}: {str(exc)}"


async def get_retries_left(task_id: str) -> int:
    from services.task_executor import get_current_job

    try:
        current_job = get_current_job()
        return current_job.retries_left if current_job else 0
    except Exception as job_err:
        logger.error(
            "Could not determine retries_left for task %s: %s", task_id, job_err
        )
        return 0


async def handle_retryable_error(db_service, context, exc) -> None:
    logger.warning(
        "Retryable error in task %s: %s: %s",
        context.task_id,
        type(exc).__name__,
        str(exc),
        extra={
            "task_id": context.task_id,
            "project_id": context.project_id,
            "error_type": type(exc).__name__,
            "execution_time": time.time() - context.start_time,
            "timestamp": time.time(),
        },
    )

    try:
        await db_service.increment_task_retry_count(context.task_id)
    except Exception as db_error:
        logger.error("Failed to increment retry count: %s", db_error)

    retries_left = await get_retries_left(context.task_id)
    if retries_left > 0:
        return

    error_code, error_msg = _classify_generation_error(exc)
    await db_service.update_generation_task_status(
        task_id=context.task_id,
        status=TaskStatus.FAILED,
        error_message=error_msg,
    )
    try:
        await sync_session_terminal_state(
            db_service=db_service,
            task_id=context.task_id,
            session_id=context.session_id,
            state="FAILED",
            state_reason=(
                TaskFailureStateReason.FAILED_TIMEOUT_RETRY_EXHAUSTED.value
                if error_code == TaskExecutionErrorCode.TIMEOUT.value
                else TaskFailureStateReason.FAILED_RETRY_EXHAUSTED.value
            ),
            error_message=error_msg,
            error_code=error_code,
            retryable=True,
        )
    except Exception as sync_err:
        logger.error(
            "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
            context.task_id,
            context.session_id,
            sync_err,
            exc_info=True,
        )


async def handle_permanent_error(db_service, context, exc) -> None:
    error_code, error_msg = _classify_generation_error(exc)
    logger.error(
        "Permanent error in task %s: %s: %s",
        context.task_id,
        type(exc).__name__,
        str(exc),
        extra={
            "task_id": context.task_id,
            "project_id": context.project_id,
            "error_type": type(exc).__name__,
            "execution_time": time.time() - context.start_time,
            "timestamp": time.time(),
        },
        exc_info=True,
    )

    await db_service.update_generation_task_status(
        task_id=context.task_id,
        status=TaskStatus.FAILED,
        error_message=error_msg,
    )
    try:
        await sync_session_terminal_state(
            db_service=db_service,
            task_id=context.task_id,
            session_id=context.session_id,
            state="FAILED",
            state_reason=(
                TaskFailureStateReason.FAILED_TIMEOUT.value
                if error_code == TaskExecutionErrorCode.TIMEOUT.value
                else TaskFailureStateReason.FAILED_PERMANENT_ERROR.value
            ),
            error_message=error_msg,
            error_code=error_code,
            retryable=False,
        )
    except Exception as sync_err:
        logger.error(
            "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
            context.task_id,
            context.session_id,
            sync_err,
            exc_info=True,
        )


async def handle_unknown_error(db_service, context, exc) -> None:
    logger.error(
        "Unknown error in task %s: %s: %s",
        context.task_id,
        type(exc).__name__,
        str(exc),
        extra={
            "task_id": context.task_id,
            "project_id": context.project_id,
            "error_type": type(exc).__name__,
            "execution_time": time.time() - context.start_time,
            "timestamp": time.time(),
        },
        exc_info=True,
    )

    retries_left = await get_retries_left(context.task_id)
    if retries_left > 0:
        try:
            await db_service.increment_task_retry_count(context.task_id)
        except Exception as db_error:
            logger.error("Failed to increment retry count: %s", db_error)
        raise exc

    error_code, error_msg = _classify_generation_error(exc)
    await db_service.update_generation_task_status(
        task_id=context.task_id,
        status=TaskStatus.FAILED,
        error_message=error_msg,
    )
    try:
        await sync_session_terminal_state(
            db_service=db_service,
            task_id=context.task_id,
            session_id=context.session_id,
            state="FAILED",
            state_reason=(
                TaskFailureStateReason.FAILED_TIMEOUT_UNKNOWN.value
                if error_code == TaskExecutionErrorCode.TIMEOUT.value
                else TaskFailureStateReason.FAILED_UNKNOWN_ERROR.value
            ),
            error_message=error_msg,
            error_code=error_code,
            retryable=True,
        )
    except Exception as sync_err:
        logger.error(
            "failed_to_sync_session_failed_state task_id=%s session_id=%s error=%s",
            context.task_id,
            context.session_id,
            sync_err,
            exc_info=True,
        )
    raise exc
