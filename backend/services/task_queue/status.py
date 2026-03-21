import logging
from datetime import datetime, timezone
from typing import Optional

from rq import Worker
from rq.job import Job
from rq.registry import FailedJobRegistry, FinishedJobRegistry, StartedJobRegistry

from .status_constants import CANCELABLE_QUEUE_JOB_STATUSES, QueueJobStatus

logger = logging.getLogger(__name__)
WORKER_HEARTBEAT_FRESHNESS_SECONDS = 45


def normalize_status(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _is_worker_fresh(worker) -> bool:
    last_heartbeat = getattr(worker, "last_heartbeat", None)
    if last_heartbeat is None:
        return False
    if last_heartbeat.tzinfo is None:
        last_heartbeat = last_heartbeat.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - last_heartbeat).total_seconds()
    return age_seconds <= WORKER_HEARTBEAT_FRESHNESS_SECONDS


def get_job_status(service, job_id: str) -> Optional[dict]:
    try:
        job = Job.fetch(job_id, connection=service.redis_conn)
        status = normalize_status(job.get_status())
        status_info = {
            "job_id": job.id,
            "status": status,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "ended_at": job.ended_at.isoformat() if job.ended_at else None,
        }
        if job.is_finished:
            status_info["result"] = job.result
        if job.is_failed:
            status_info["exc_info"] = job.exc_info
        return status_info
    except Exception as e:
        logger.warning("Failed to fetch job %s: %s", job_id, e)
        return None


def cancel_job(service, job_id: str) -> bool:
    try:
        job = Job.fetch(job_id, connection=service.redis_conn)
        status = normalize_status(job.get_status())
        if status in CANCELABLE_QUEUE_JOB_STATUSES:
            job.cancel()
            logger.info("Canceled job: %s", job_id)
            return True
        logger.warning("Cannot cancel job %s with status %s", job_id, status)
        return False
    except Exception as e:
        logger.error("Failed to cancel job %s: %s", job_id, e)
        return False


def get_queue_info(service) -> dict:
    try:
        workers = Worker.all(connection=service.redis_conn)
        alive_workers = [worker for worker in workers if _is_worker_fresh(worker)]
        started_count = 0
        finished_count = 0
        failed_count = 0
        for queue_name in ("high", "default", "low"):
            started_count += len(
                StartedJobRegistry(queue_name, connection=service.redis_conn)
            )
            finished_count += len(
                FinishedJobRegistry(queue_name, connection=service.redis_conn)
            )
            failed_count += len(
                FailedJobRegistry(queue_name, connection=service.redis_conn)
            )
        return {
            "queues": {
                "high": {"name": "high", "count": len(service.high_queue)},
                "default": {"name": "default", "count": len(service.default_queue)},
                "low": {"name": "low", "count": len(service.low_queue)},
            },
            "workers": {
                "count": len(alive_workers),
                "active": [
                    worker.name
                    for worker in alive_workers
                    if worker.get_state() == "busy"
                ],
                "stale": [
                    worker.name for worker in workers if worker not in alive_workers
                ],
            },
            "jobs": {
                "started": started_count,
                "finished": finished_count,
                "failed": failed_count,
            },
        }
    except Exception as e:
        logger.error("Failed to get queue info: %s", e)
        return {
            "queues": {},
            "workers": {"count": 0, "active": [], "stale": []},
            "jobs": {
                QueueJobStatus.STARTED.value: 0,
                QueueJobStatus.FINISHED.value: 0,
                QueueJobStatus.FAILED.value: 0,
            },
            "error": str(e),
        }
