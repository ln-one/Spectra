from __future__ import annotations

from enum import Enum


class QueueJobStatus(str, Enum):
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    DEFERRED = "deferred"
    STARTED = "started"
    FINISHED = "finished"
    FAILED = "failed"


class QueueWorkerAvailability(str, Enum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


CANCELABLE_QUEUE_JOB_STATUSES: frozenset[str] = frozenset(
    {
        QueueJobStatus.QUEUED.value,
        QueueJobStatus.SCHEDULED.value,
        QueueJobStatus.DEFERRED.value,
    }
)

ACTIVE_QUEUE_JOB_STATUSES: frozenset[str] = frozenset(
    {
        QueueJobStatus.QUEUED.value,
        QueueJobStatus.SCHEDULED.value,
        QueueJobStatus.DEFERRED.value,
        QueueJobStatus.STARTED.value,
    }
)
