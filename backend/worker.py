"""
RQ Worker 启动脚本

启动 RQ Worker 进程，监听任务队列并执行任务。
"""

import asyncio
import logging
import os
import signal
import socket
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from redis import Redis
from rq import Queue, SimpleWorker, Worker
from rq.job import Job, JobStatus
from rq.registry import StartedJobRegistry
from rq.timeouts import TimerDeathPenalty

from services.task_queue.status import _resolve_worker_heartbeat_freshness_seconds

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

# 全局变量用于优雅关闭
worker_instance = None


def _resolve_worker_name() -> str:
    """Build a unique worker name to avoid stale Redis registrations on restart."""
    base_name = (os.getenv("WORKER_NAME") or "worker").strip() or "worker"
    hostname = socket.gethostname().split(".", 1)[0].strip() or "host"
    boot_nonce = uuid.uuid4().hex[:8]
    return f"{base_name}@{hostname}:{os.getpid()}:{boot_nonce}"


def _is_worker_fresh(worker, freshness_seconds: int) -> bool:
    last_heartbeat = getattr(worker, "last_heartbeat", None)
    if last_heartbeat is None:
        return False
    if last_heartbeat.tzinfo is None:
        last_heartbeat = last_heartbeat.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - last_heartbeat).total_seconds()
    return age_seconds <= freshness_seconds


def _recover_stale_started_jobs(
    redis_conn: Redis,
    queue_names: list[str],
    stale_seconds: int = 90,
    worker_freshness_seconds: int | None = None,
) -> list[dict]:
    """
    Requeue RQ jobs left in STARTED after a worker crash.

    We only recover jobs whose assigned worker is no longer fresh and whose
    started timestamp is older than a conservative threshold.
    """
    workers = Worker.all(connection=redis_conn)
    fresh_worker_names = {
        worker.name
        for worker in workers
        if _is_worker_fresh(
            worker,
            worker_freshness_seconds
            or _resolve_worker_heartbeat_freshness_seconds(worker),
        )
    }
    recovered: list[dict] = []

    for queue_name in queue_names:
        queue = Queue(queue_name, connection=redis_conn)
        registry = StartedJobRegistry(queue_name, connection=redis_conn)
        for job_id in registry.get_job_ids():
            try:
                job = Job.fetch(job_id, connection=redis_conn)
            except Exception as exc:
                logger.warning("Failed to inspect started job %s: %s", job_id, exc)
                continue

            if job.get_status() != JobStatus.STARTED:
                continue

            started_at = job.started_at
            if started_at is None:
                continue
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            age_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
            if age_seconds < stale_seconds:
                continue

            worker_name = getattr(job, "worker_name", None)
            if worker_name and worker_name in fresh_worker_names:
                continue

            with redis_conn.pipeline() as pipeline:
                registry.remove(job, pipeline=pipeline)
                try:
                    registry.remove_executions(job, pipeline=pipeline)
                except Exception as exc:
                    logger.debug(
                        "Failed to remove job executions during recovery: "
                        "job=%s error=%s",
                        job.id,
                        exc,
                    )
                queue._enqueue_job(job, pipeline=pipeline)
                pipeline.execute()

            recovered.append(
                {
                    "job_id": job.id,
                    "queue": queue_name,
                    "worker_name": worker_name,
                    "age_seconds": round(age_seconds, 2),
                }
            )
            logger.warning(
                "Recovered stale started job: job_id=%s queue=%s worker=%s age=%.2fs",
                job.id,
                queue_name,
                worker_name,
                age_seconds,
            )

    return recovered


async def _run_recovery_scan():
    """
    Run one recovery pass on worker startup to mark stale processing tasks.
    """
    from services.database import DatabaseService
    from services.platform.task_recovery import TaskRecoveryService

    db_service = DatabaseService()
    await db_service.connect()
    try:
        summary = await TaskRecoveryService(db_service.db).recover_stale_tasks()
        logger.info(
            "Task recovery scan completed: scanned=%s recovered=%s session_updated=%s",
            summary.get("scanned"),
            summary.get("recovered"),
            summary.get("session_updated"),
        )
    finally:
        await db_service.disconnect()


def signal_handler(signum, frame):
    """处理终止信号，优雅关闭 Worker"""
    signal_name = "SIGTERM" if signum == signal.SIGTERM else "SIGINT"
    logger.info(f"Received {signal_name}, shutting down gracefully...")

    if worker_instance:
        logger.info("Requesting worker to stop after current job...")
        worker_instance.request_stop()
    else:
        logger.warning("No worker instance found, exiting immediately")
        sys.exit(0)


def main():
    """启动 RQ Worker"""
    global worker_instance

    # Load environment variables
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:  # pragma: no cover - runtime fallback

        def load_dotenv(*args, **kwargs):
            return False

    base_dir = Path(__file__).resolve().parent
    load_dotenv(dotenv_path=base_dir / ".env", override=False)

    from services.runtime_env import (
        normalize_database_url_for_host_runtime,
        normalize_internal_service_urls_for_host_runtime,
    )

    normalize_database_url_for_host_runtime()
    normalize_internal_service_urls_for_host_runtime()

    # 注册信号处理器
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # 从环境变量读取 Redis 配置
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_password = os.getenv("REDIS_PASSWORD")
    redis_db = int(os.getenv("REDIS_DB", "0"))

    logger.info(f"Connecting to Redis at {redis_host}:{redis_port} (db={redis_db})")

    # 创建 Redis 连接
    redis_conn = Redis(
        host=redis_host,
        port=redis_port,
        password=redis_password,
        db=redis_db,
        decode_responses=False,
    )

    # 测试连接
    try:
        redis_conn.ping()
        logger.info("Redis connection successful")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    # 创建队列列表（按优先级顺序）
    queues = ["high", "default", "low"]
    logger.info(f"Worker listen to queues: {queues}")

    if os.getenv("RQ_RECOVER_STALE_STARTED_JOBS", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        try:
            recovered_jobs = _recover_stale_started_jobs(
                redis_conn=redis_conn,
                queue_names=queues,
                stale_seconds=int(os.getenv("RQ_STALE_JOB_SECONDS", "90")),
                worker_freshness_seconds=_resolve_worker_heartbeat_freshness_seconds(),
            )
            if recovered_jobs:
                logger.info("Recovered %s stale started RQ jobs", len(recovered_jobs))
        except Exception as e:
            logger.error("Stale RQ job recovery failed: %s", e, exc_info=True)

    # Startup recovery scan for stale tasks
    if os.getenv("WORKER_RECOVERY_SCAN", "true").lower() in {"1", "true", "yes", "on"}:
        try:
            asyncio.run(_run_recovery_scan())
        except Exception as e:
            logger.error("Task recovery scan failed: %s", e, exc_info=True)

    # 对 async/Prisma 任务，SimpleWorker（不 fork）更稳定
    worker_class_name = os.getenv("RQ_WORKER_CLASS", "simple").lower()
    worker_cls = SimpleWorker if worker_class_name == "simple" else Worker
    if os.name == "nt":
        # Windows 没有 SIGALRM，RQ 默认的 UnixSignalDeathPenalty 会在执行前崩溃。
        worker_cls.death_penalty_class = TimerDeathPenalty
        logger.info("Using TimerDeathPenalty for RQ worker on Windows")

    # 创建并启动 Worker
    worker_instance = worker_cls(
        queues,
        connection=redis_conn,
        name=_resolve_worker_name(),
    )

    logger.info(
        f"Starting worker: {worker_instance.name} (class={worker_cls.__name__})"
    )

    # IMPORTANT: SimpleWorker runs jobs in the same loop.
    # But many jobs are async. We need to ensure the global db_service is connected.

    async def run_worker_loop():
        from services.database import db_service as global_db

        await global_db.connect()
        try:
            # SimpleWorker.work is synchronous and blocking.
            # We wrap it to allow the async loop to handle Prisma heartbeats if any.
            # However, RQ SimpleWorker just executes the function.
            worker_instance.work(with_scheduler=True)
        finally:
            await global_db.disconnect()

    try:
        asyncio.run(run_worker_loop())
    except Exception as e:
        logger.error(f"Worker error: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logger.info("Worker stopped")
        redis_conn.close()


if __name__ == "__main__":
    main()
