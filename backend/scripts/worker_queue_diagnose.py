#!/usr/bin/env python3
"""Inspect worker/queue health for demo and light production environments."""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class RegistrySummary:
    queue: str
    status: str
    count: int
    oldest_age_seconds: float | None
    sample_job_ids: tuple[str, ...]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _job_timestamp(job, status: str) -> datetime | None:
    if status == "started":
        return job.started_at or job.created_at
    if status == "failed":
        return job.ended_at or job.started_at or job.created_at
    return job.created_at


def _age_seconds(value: datetime | None) -> float | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return max((_utcnow() - value).total_seconds(), 0.0)


def summarize_registry(
    registry,
    *,
    queue: str,
    status: str,
    sample_limit: int = 3,
) -> RegistrySummary:
    from rq.job import Job

    job_ids = list(registry.get_job_ids())
    oldest_age_seconds: float | None = None
    sample_ids: list[str] = []

    for job_id in job_ids[:sample_limit]:
        sample_ids.append(job_id)

    for job_id in job_ids:
        job = Job.fetch(job_id, connection=registry.connection)
        age = _age_seconds(_job_timestamp(job, status))
        if age is None:
            continue
        if oldest_age_seconds is None or age > oldest_age_seconds:
            oldest_age_seconds = age

    return RegistrySummary(
        queue=queue,
        status=status,
        count=len(job_ids),
        oldest_age_seconds=oldest_age_seconds,
        sample_job_ids=tuple(sample_ids),
    )


def evaluate_health(
    queue_info: dict,
    registry_summaries: Iterable[RegistrySummary],
    *,
    stuck_started_threshold_seconds: float,
) -> tuple[list[str], int]:
    messages: list[str] = []
    failures = 0

    worker_count = int((queue_info.get("workers") or {}).get("count", 0) or 0)
    if worker_count <= 0:
        failures += 1
        messages.append("FAIL workers: no active workers registered")
    else:
        messages.append(f"PASS workers: {worker_count} worker(s) visible")

    for summary in registry_summaries:
        age = summary.oldest_age_seconds
        if summary.status == "started":
            if summary.count and age and age >= stuck_started_threshold_seconds:
                failures += 1
                messages.append(
                    "FAIL started-registry: "
                    f"queue={summary.queue} count={summary.count} "
                    f"oldest_age={age:.0f}s sample={list(summary.sample_job_ids)}"
                )
            else:
                messages.append(
                    "PASS started-registry: "
                    f"queue={summary.queue} count={summary.count}"
                )
        elif summary.status == "failed":
            level = "WARN" if summary.count else "PASS"
            suffix = (
                f" oldest_age={age:.0f}s sample={list(summary.sample_job_ids)}"
                if summary.count
                else ""
            )
            messages.append(
                "".join(
                    [
                        f"{level} failed-registry: ",
                        f"queue={summary.queue} ",
                        f"count={summary.count}",
                        suffix,
                    ]
                )
            )

    for queue_name, details in (queue_info.get("queues") or {}).items():
        messages.append(
            f"INFO queue-depth: queue={queue_name} count={details.get('count', 0)}"
        )

    return messages, failures


async def _diagnose(args: argparse.Namespace) -> int:
    backend_root = Path(__file__).resolve().parents[1]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from rq.registry import FailedJobRegistry, StartedJobRegistry

    from services.platform.redis_manager import RedisConnectionManager
    from services.task_queue import TaskQueueService

    manager = RedisConnectionManager.from_env()
    try:
        await manager.connect()
    except Exception as exc:
        print(f"FAIL redis: {exc}")
        return 1

    try:
        queue_service = TaskQueueService(manager.get_connection())
        queue_info = queue_service.get_queue_info()

        summaries: list[RegistrySummary] = []
        for queue_name in ("high", "default", "low"):
            summaries.append(
                summarize_registry(
                    StartedJobRegistry(queue_name, connection=queue_service.redis_conn),
                    queue=queue_name,
                    status="started",
                )
            )
            summaries.append(
                summarize_registry(
                    FailedJobRegistry(queue_name, connection=queue_service.redis_conn),
                    queue=queue_name,
                    status="failed",
                )
            )

        messages, failures = evaluate_health(
            queue_info,
            summaries,
            stuck_started_threshold_seconds=args.stuck_started_threshold_seconds,
        )
        print("Worker/queue diagnose")
        for message in messages:
            print(message)
        return 1 if failures else 0
    finally:
        await manager.disconnect()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--stuck-started-threshold-seconds",
        type=float,
        default=600.0,
        help="mark started jobs older than this threshold as suspicious",
    )
    args = parser.parse_args()
    return asyncio.run(_diagnose(args))


if __name__ == "__main__":
    raise SystemExit(main())
