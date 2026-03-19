from __future__ import annotations

from enum import Enum


class RecoveryEventType(str, Enum):
    TASK_FAILED = "task.failed"


class RecoveryErrorCode(str, Enum):
    WORKER_INTERRUPTED = "WORKER_INTERRUPTED"


class RecoveryStateReason(str, Enum):
    WORKER_INTERRUPTED = "worker_interrupted"
