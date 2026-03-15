"""
RQ 任务队列服务

封装 RQ 队列操作，提供任务提交和查询接口。
"""

import logging
import os
from typing import Optional

from redis import Redis
from rq import Queue, Retry
from rq.job import Job
from rq.registry import FailedJobRegistry, FinishedJobRegistry, StartedJobRegistry

logger = logging.getLogger(__name__)

DEFAULT_RAG_INDEX_TIMEOUT = int(os.getenv("RQ_RAG_INDEX_TIMEOUT", "1800"))
MAX_RAG_INDEX_TIMEOUT = int(os.getenv("RQ_RAG_INDEX_TIMEOUT_MAX", "3600"))


class TaskQueueService:
    """RQ 任务队列服务"""

    def __init__(self, redis_conn: Redis):
        """
        初始化队列服务

        Args:
            redis_conn: Redis 连接实例
        """
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
        template_config: Optional[dict] = None,
        priority: str = "default",
        timeout: int = 1800,  # 30 minutes default
    ) -> Job:
        """
        提交课件生成任务到队列

        Args:
            task_id: 任务 ID
            project_id: 项目 ID
            task_type: 任务类型（pptx/docx/both）
            template_config: 模板配置（可选）
            priority: 优先级（high/default/low）
            timeout: 超时时间（秒），默认 1800 秒（30分钟），最大 3600 秒（60分钟）

        Returns:
            Job: RQ Job 实例

        Raises:
            ValueError: 优先级参数无效或超时时间超出范围时抛出
        """
        # Validate timeout
        if timeout < 60:
            raise ValueError("Timeout must be at least 60 seconds")
        if timeout > 3600:
            raise ValueError("Timeout cannot exceed 3600 seconds (60 minutes)")

        # Select queue based on priority
        if priority == "high":
            queue = self.high_queue
        elif priority == "default":
            queue = self.default_queue
        elif priority == "low":
            queue = self.low_queue
        else:
            raise ValueError(f"Invalid priority: {priority}")

        # Import here to avoid circular dependency
        # Use the sync wrapper so RQ worker executes the coroutine properly
        from services.task_executor import (
            run_generation_task as execute_generation_task,
        )

        # 配置重试策略：最多重试 3 次，间隔为 1分钟、5分钟、15分钟
        retry_strategy = Retry(max=3, interval=[60, 300, 900])

        # Enqueue task
        job = queue.enqueue(
            execute_generation_task,
            task_id=task_id,
            project_id=project_id,
            task_type=task_type,
            template_config=template_config,
            job_timeout=timeout,
            retry=retry_strategy,
            result_ttl=int(os.getenv("RQ_RESULT_TTL", "86400")),  # 24 hours
            failure_ttl=int(os.getenv("RQ_FAILURE_TTL", "604800")),  # 7 days
        )

        logger.info(
            f"Enqueued generation task: task_id={task_id}, "
            f"job_id={job.id}, priority={priority}, timeout={timeout}s"
        )

        return job

    def enqueue_rag_indexing_task(
        self,
        file_id: str,
        project_id: str,
        session_id: Optional[str] = None,
        priority: str = "default",
        timeout: int = DEFAULT_RAG_INDEX_TIMEOUT,
    ) -> Job:
        """
        提交 RAG 索引任务到可恢复队列（C1）。

        Args:
            file_id: Upload 记录 ID
            project_id: 项目 ID
            session_id: 会话 ID（C5 数据隔离可选）
            priority: 优先级（high/default/low）
            timeout: 超时时间（秒），默认取 RQ_RAG_INDEX_TIMEOUT（缺省 1800 秒）

        Returns:
            Job: RQ Job 实例
        """
        if timeout < 30:
            raise ValueError("Timeout must be at least 30 seconds")
        if timeout > MAX_RAG_INDEX_TIMEOUT:
            raise ValueError(f"Timeout cannot exceed {MAX_RAG_INDEX_TIMEOUT} seconds")

        if priority == "high":
            queue = self.high_queue
        elif priority == "default":
            queue = self.default_queue
        elif priority == "low":
            queue = self.low_queue
        else:
            raise ValueError(f"Invalid priority: {priority}")

        from services.task_executor import run_rag_indexing_task

        retry_strategy = Retry(max=2, interval=[30, 120])

        job = queue.enqueue(
            run_rag_indexing_task,
            file_id=file_id,
            project_id=project_id,
            session_id=session_id,
            job_timeout=timeout,
            retry=retry_strategy,
            result_ttl=int(os.getenv("RQ_RESULT_TTL", "86400")),
            failure_ttl=int(os.getenv("RQ_FAILURE_TTL", "604800")),
        )

        logger.info(
            "Enqueued RAG indexing task: file_id=%s project_id=%s job_id=%s",
            file_id,
            project_id,
            job.id,
        )
        return job

    def enqueue_outline_draft_task(
        self,
        session_id: str,
        project_id: str,
        options: Optional[dict] = None,
        priority: str = "default",
        timeout: int = 300,
    ) -> Job:
        """
        提交大纲草拟任务到队列

        Args:
            session_id: 会话 ID
            project_id: 项目 ID
            options: 生成选项（可选）
            priority: 优先级（high/default/low）
            timeout: 超时时间（秒），默认 300 秒

        Returns:
            Job: RQ Job 实例

        Raises:
            ValueError: 优先级参数无效或超时时间超出范围时抛出
        """
        if timeout < 30:
            raise ValueError("Timeout must be at least 30 seconds")
        if timeout > 600:
            raise ValueError("Timeout cannot exceed 600 seconds (10 minutes)")

        # Select queue based on priority
        if priority == "high":
            queue = self.high_queue
        elif priority == "default":
            queue = self.default_queue
        elif priority == "low":
            queue = self.low_queue
        else:
            raise ValueError(f"Invalid priority: {priority}")

        # Import here to avoid circular dependency
        from services.task_executor import run_outline_draft_task

        # 配置重试策略：最多重试 2 次，间隔为 30秒、2分钟
        retry_strategy = Retry(max=2, interval=[30, 120])

        # Enqueue task
        job = queue.enqueue(
            run_outline_draft_task,
            session_id=session_id,
            project_id=project_id,
            options=options,
            job_timeout=timeout,
            retry=retry_strategy,
            result_ttl=int(os.getenv("RQ_RESULT_TTL", "86400")),  # 24 hours
            failure_ttl=int(os.getenv("RQ_FAILURE_TTL", "604800")),  # 7 days
        )

        logger.info(
            "Enqueued outline draft task: session_id=%s job_id=%s priority=%s",
            session_id,
            job.id,
            priority,
        )

        return job

    def get_job_status(self, job_id: str) -> Optional[dict]:
        """
        获取任务状态

        Args:
            job_id: RQ Job ID

        Returns:
            dict: 任务状态信息，包含：
                - job_id: Job ID
                - status: 状态（queued/started/finished/failed/
                  deferred/scheduled/stopped/canceled）
                - result: 执行结果（如果已完成）
                - exc_info: 错误信息（如果失败）
            None: Job 不存在时返回 None
        """
        try:
            job = Job.fetch(job_id, connection=self.redis_conn)
            status = self._normalize_status(job.get_status())

            status_info = {
                "job_id": job.id,
                "status": status,
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "ended_at": job.ended_at.isoformat() if job.ended_at else None,
            }

            # Add result if finished
            if job.is_finished:
                status_info["result"] = job.result

            # Add error info if failed
            if job.is_failed:
                status_info["exc_info"] = job.exc_info

            return status_info

        except Exception as e:
            logger.warning(f"Failed to fetch job {job_id}: {e}")
            return None

    def cancel_job(self, job_id: str) -> bool:
        """
        取消任务

        Args:
            job_id: RQ Job ID

        Returns:
            bool: 取消成功返回 True，否则返回 False
        """
        try:
            job = Job.fetch(job_id, connection=self.redis_conn)
            status = self._normalize_status(job.get_status())

            # Can only cancel queued or scheduled jobs
            if status in ["queued", "scheduled", "deferred"]:
                job.cancel()
                logger.info(f"Canceled job: {job_id}")
                return True
            else:
                logger.warning(f"Cannot cancel job {job_id} with status {status}")
                return False

        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")
            return False

    @staticmethod
    def _normalize_status(status) -> str:
        """Normalize RQ status enum/string to plain string."""
        return status.value if hasattr(status, "value") else str(status)

    def get_queue_info(self) -> dict:
        """
        获取队列统计信息

        Returns:
            dict: 队列统计信息，包含：
                - high: 高优先级队列信息
                - default: 默认优先级队列信息
                - low: 低优先级队列信息
                - workers: Worker 数量
        """
        try:
            # Get queue lengths
            high_count = len(self.high_queue)
            default_count = len(self.default_queue)
            low_count = len(self.low_queue)

            # Get worker count
            from rq import Worker

            workers = Worker.all(connection=self.redis_conn)
            worker_count = len(workers)

            # Get registry counts aggregated across all queues
            started_count = 0
            finished_count = 0
            failed_count = 0
            for queue_name in ("high", "default", "low"):
                started_count += len(
                    StartedJobRegistry(queue_name, connection=self.redis_conn)
                )
                finished_count += len(
                    FinishedJobRegistry(queue_name, connection=self.redis_conn)
                )
                failed_count += len(
                    FailedJobRegistry(queue_name, connection=self.redis_conn)
                )

            return {
                "queues": {
                    "high": {
                        "name": "high",
                        "count": high_count,
                    },
                    "default": {
                        "name": "default",
                        "count": default_count,
                    },
                    "low": {
                        "name": "low",
                        "count": low_count,
                    },
                },
                "workers": {
                    "count": worker_count,
                    "active": [w.name for w in workers if w.get_state() == "busy"],
                },
                "jobs": {
                    "started": started_count,
                    "finished": finished_count,
                    "failed": failed_count,
                },
            }

        except Exception as e:
            logger.error(f"Failed to get queue info: {e}")
            return {
                "queues": {},
                "workers": {"count": 0, "active": []},
                "jobs": {"started": 0, "finished": 0, "failed": 0},
                "error": str(e),
            }
