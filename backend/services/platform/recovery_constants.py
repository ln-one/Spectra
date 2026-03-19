from __future__ import annotations

from enum import Enum


class RecoveryErrorCode(str, Enum):
    WORKER_INTERRUPTED = "WORKER_INTERRUPTED"


class RecoveryStateReason(str, Enum):
    WORKER_INTERRUPTED = "worker_interrupted"
