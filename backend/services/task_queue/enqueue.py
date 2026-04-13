import logging
from typing import Optional

from rq import Retry
from rq.job import Job

from services.task_queue.constants import (
    DEFAULT_RAG_INDEX_TIMEOUT,
    FAILURE_TTL,
    MAX_RAG_INDEX_TIMEOUT,
    RESULT_TTL,
)

logger = logging.getLogger(__name__)


def _resolve_queue(service, priority: str):
    if priority == "high":
        return service.high_queue
    if priority == "default":
        return service.default_queue
    if priority == "low":
        return service.low_queue
    raise ValueError(f"Invalid priority: {priority}")


def enqueue_generation_task(
    service,
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
    priority: str = "default",
    timeout: int = 1800,
) -> Job:
    raise RuntimeError(
        "Legacy generation-task queue path has been removed. "
        "Use Diego-driven generation session flow instead."
    )


def enqueue_rag_indexing_task(
    service,
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
    parse_provider_override: Optional[str] = None,
    fallback_triggered: bool = False,
    priority: str = "default",
    timeout: int = DEFAULT_RAG_INDEX_TIMEOUT,
) -> Job:
    if timeout < 30:
        raise ValueError("Timeout must be at least 30 seconds")
    if timeout > MAX_RAG_INDEX_TIMEOUT:
        raise ValueError(f"Timeout cannot exceed {MAX_RAG_INDEX_TIMEOUT} seconds")

    from services.task_executor import run_rag_indexing_task

    job = _resolve_queue(service, priority).enqueue(
        run_rag_indexing_task,
        file_id=file_id,
        project_id=project_id,
        session_id=session_id,
        parse_provider_override=parse_provider_override,
        fallback_triggered=fallback_triggered,
        job_timeout=timeout,
        retry=Retry(max=2, interval=[30, 120]),
        result_ttl=RESULT_TTL,
        failure_ttl=FAILURE_TTL,
    )
    logger.info(
        "Enqueued RAG indexing task: file_id=%s project_id=%s job_id=%s",
        file_id,
        project_id,
        job.id,
    )
    return job


def enqueue_remote_parse_reconcile_task(
    service,
    file_id: str,
    project_id: str,
    session_id: Optional[str] = None,
    priority: str = "default",
    delay_seconds: int = 5,
    timeout: int = DEFAULT_RAG_INDEX_TIMEOUT,
) -> Job:
    if timeout < 30:
        raise ValueError("Timeout must be at least 30 seconds")
    if timeout > MAX_RAG_INDEX_TIMEOUT:
        raise ValueError(f"Timeout cannot exceed {MAX_RAG_INDEX_TIMEOUT} seconds")

    from services.task_executor import run_remote_parse_reconcile_task

    queue = _resolve_queue(service, priority)
    enqueue_kwargs = dict(
        file_id=file_id,
        project_id=project_id,
        session_id=session_id,
        initial_delay_seconds=delay_seconds,
        job_timeout=timeout,
        retry=Retry(max=2, interval=[30, 120]),
        result_ttl=RESULT_TTL,
        failure_ttl=FAILURE_TTL,
    )
    job = queue.enqueue(
        run_remote_parse_reconcile_task,
        **enqueue_kwargs,
    )
    logger.info(
        (
            "Enqueued remote parse reconcile task: file_id=%s project_id=%s "
            "job_id=%s delay=%ss"
        ),
        file_id,
        project_id,
        job.id,
        delay_seconds,
    )
    return job
