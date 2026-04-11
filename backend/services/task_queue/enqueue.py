import logging
from typing import Optional

from rq import Retry
from rq.job import Job

from schemas.generation import normalize_generation_type
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
    if timeout < 60:
        raise ValueError("Timeout must be at least 60 seconds")
    if timeout > 3600:
        raise ValueError("Timeout cannot exceed 3600 seconds (60 minutes)")

    from services.task_executor import run_generation_task as execute_generation_task

    normalized_task_type = normalize_generation_type(task_type).value

    job = _resolve_queue(service, priority).enqueue(
        execute_generation_task,
        task_id=task_id,
        project_id=project_id,
        task_type=normalized_task_type,
        template_config=template_config,
        job_timeout=timeout,
        retry=Retry(max=3, interval=[60, 300, 900]),
        result_ttl=RESULT_TTL,
        failure_ttl=FAILURE_TTL,
    )
    logger.info(
        "Enqueued generation task: task_id=%s, job_id=%s, priority=%s, timeout=%ss",
        task_id,
        job.id,
        priority,
        timeout,
    )
    return job


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


def enqueue_outline_draft_task(
    service,
    session_id: str,
    project_id: str,
    options: Optional[dict] = None,
    priority: str = "default",
    timeout: int = 300,
) -> Job:
    if timeout < 30:
        raise ValueError("Timeout must be at least 30 seconds")
    if timeout > 600:
        raise ValueError("Timeout cannot exceed 600 seconds (10 minutes)")

    from services.task_executor import run_outline_draft_task

    job = _resolve_queue(service, priority).enqueue(
        run_outline_draft_task,
        session_id=session_id,
        project_id=project_id,
        options=options,
        job_timeout=timeout,
        retry=Retry(max=2, interval=[30, 120]),
        result_ttl=RESULT_TTL,
        failure_ttl=FAILURE_TTL,
    )
    logger.info(
        "Enqueued outline draft task: session_id=%s job_id=%s priority=%s",
        session_id,
        job.id,
        priority,
    )
    return job
