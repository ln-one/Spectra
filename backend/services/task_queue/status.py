import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from rq import Worker
from rq.job import Job
from rq.registry import FailedJobRegistry, FinishedJobRegistry, StartedJobRegistry

from .status_constants import (
    CANCELABLE_QUEUE_JOB_STATUSES,
    QueueJobStatus,
    QueueWorkerAvailability,
)

logger = logging.getLogger(__name__)
DEFAULT_WORKER_HEARTBEAT_FRESHNESS_SECONDS = 210


def _resolve_worker_heartbeat_freshness_seconds(worker=None) -> int:
    raw = os.getenv("RQ_WORKER_HEARTBEAT_FRESHNESS_SECONDS")
    if raw is not None and str(raw).strip():
        try:
            parsed = int(str(raw).strip())
            if parsed > 0:
                return parsed
        except ValueError:
            logger.warning(
                "Invalid RQ_WORKER_HEARTBEAT_FRESHNESS_SECONDS=%s, using default",
                raw,
            )

    worker_ttl = getattr(worker, "worker_ttl", None)
    try:
        parsed_ttl = int(worker_ttl)
    except (TypeError, ValueError):
        parsed_ttl = 0
    if parsed_ttl > 0:
        return max(45, parsed_ttl)

    return DEFAULT_WORKER_HEARTBEAT_FRESHNESS_SECONDS


def normalize_status(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _is_worker_fresh(worker) -> bool:
    last_heartbeat = getattr(worker, "last_heartbeat", None)
    if last_heartbeat is None:
        return False
    if last_heartbeat.tzinfo is None:
        last_heartbeat = last_heartbeat.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - last_heartbeat).total_seconds()
    return age_seconds <= _resolve_worker_heartbeat_freshness_seconds(worker)


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


def inspect_worker_availability(service) -> dict:
    if service is None:
        return {
            "status": QueueWorkerAvailability.UNAVAILABLE.value,
            "worker_count": 0,
            "stale_worker_count": 0,
            "error": None,
        }

    try:
        queue_info = service.get_queue_info()
    except Exception as exc:
        logger.warning("Failed to inspect queue worker availability: %s", exc)
        return {
            "status": QueueWorkerAvailability.UNKNOWN.value,
            "worker_count": 0,
            "stale_worker_count": 0,
            "error": str(exc),
        }

    if not isinstance(queue_info, dict):
        return {
            "status": QueueWorkerAvailability.UNKNOWN.value,
            "worker_count": 0,
            "stale_worker_count": 0,
            "error": "queue_info_not_dict",
        }

    workers = queue_info.get("workers") or {}
    worker_count = int(workers.get("count") or 0)
    stale_workers = workers.get("stale") or []
    stale_worker_count = len(stale_workers) if isinstance(stale_workers, list) else 0
    error = queue_info.get("error")
    if error:
        status = QueueWorkerAvailability.UNKNOWN.value
    elif worker_count > 0:
        status = QueueWorkerAvailability.AVAILABLE.value
    else:
        status = QueueWorkerAvailability.UNAVAILABLE.value

    return {
        "status": status,
        "worker_count": worker_count,
        "stale_worker_count": stale_worker_count,
        "error": str(error) if error else None,
    }


async def resolve_worker_availability(
    service,
    *,
    retries: int = 1,
    retry_delay_seconds: float = 0.15,
) -> dict:
    availability = inspect_worker_availability(service)
    if availability["status"] != QueueWorkerAvailability.UNKNOWN.value:
        return availability

    attempts = max(0, int(retries))
    for _ in range(attempts):
        await asyncio.sleep(max(0.0, retry_delay_seconds))
        availability = inspect_worker_availability(service)
        if availability["status"] != QueueWorkerAvailability.UNKNOWN.value:
            break
    return availability
