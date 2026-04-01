"""RQ 任务队列服务。"""

import logging

from redis import Redis
from rq import Queue

from services.task_queue.enqueue import (
    enqueue_generation_task,
    enqueue_outline_draft_task,
    enqueue_rag_indexing_task,
)
from services.task_queue.status import (
    cancel_job,
    get_job_status,
    get_queue_info,
    normalize_status,
)

logger = logging.getLogger(__name__)


class TaskQueueService:
    """RQ 任务队列服务。"""

    def __init__(self, redis_conn: Redis):
        self.redis_conn = redis_conn
        self.high_queue = Queue("high", connection=redis_conn)
        self.default_queue = Queue("default", connection=redis_conn)
        self.low_queue = Queue("low", connection=redis_conn)
        logger.info("Task queue service initialized with 3 priority queues")

    def enqueue_generation_task(
        self,
        task_id: str,
        project_id: str,
        task_type: str,
        template_config=None,
        priority: str = "default",
        timeout: int = 1800,
    ):
        return enqueue_generation_task(
            self,
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
            priority=priority,
            timeout=timeout,
        )

    def enqueue_rag_indexing_task(
        self,
        file_id: str,
        project_id: str,
        session_id=None,
        parse_provider_override=None,
        fallback_triggered: bool = False,
        priority: str = "default",
        timeout: int = 1800,
    ):
        return enqueue_rag_indexing_task(
            self,
            file_id=file_id,
            project_id=project_id,
            session_id=session_id,
            parse_provider_override=parse_provider_override,
            fallback_triggered=fallback_triggered,
            priority=priority,
            timeout=timeout,
        )

    def enqueue_outline_draft_task(
        self,
        session_id: str,
        project_id: str,
        options=None,
        priority: str = "default",
        timeout: int = 300,
    ):
        return enqueue_outline_draft_task(
            self,
            session_id=session_id,
            project_id=project_id,
            options=options,
            priority=priority,
            timeout=timeout,
        )

    def get_job_status(self, job_id: str):
        return get_job_status(self, job_id)

    def cancel_job(self, job_id: str) -> bool:
        return cancel_job(self, job_id)

    @staticmethod
    def _normalize_status(status) -> str:
        return normalize_status(status)

    def get_queue_info(self) -> dict:
        return get_queue_info(self)
