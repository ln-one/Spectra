from __future__ import annotations

from enum import Enum


class TaskExecutionErrorCode(str, Enum):
    TIMEOUT = "TASK_EXECUTION_TIMEOUT"
    FAILED = "TASK_EXECUTION_FAILED"


class TaskFailureStateReason(str, Enum):
    FAILED_TIMEOUT = "task_failed_timeout"
    FAILED_TIMEOUT_RETRY_EXHAUSTED = "task_failed_timeout_retry_exhausted"
    FAILED_TIMEOUT_UNKNOWN = "task_failed_timeout_unknown"
    FAILED_RETRY_EXHAUSTED = "task_failed_retry_exhausted"
    FAILED_PERMANENT_ERROR = "task_failed_permanent_error"
    FAILED_UNKNOWN_ERROR = "task_failed_unknown_error"
    COMPLETED = "task_completed"
