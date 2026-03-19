from __future__ import annotations

from enum import Enum


class GenerationEventType(str, Enum):
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"


class GenerationErrorCode(str, Enum):
    WORKER_INTERRUPTED = "WORKER_INTERRUPTED"


class GenerationStateReason(str, Enum):
    WORKER_INTERRUPTED = "worker_interrupted"


class OutlineGenerationErrorCode(str, Enum):
    TIMEOUT = "OUTLINE_GENERATION_TIMEOUT"
    FAILED = "OUTLINE_GENERATION_FAILED"


class OutlineGenerationStateReason(str, Enum):
    DRAFTED_ASYNC = "outline_drafted_async"
    FAILED_FALLBACK_EMPTY = "outline_draft_failed_fallback_empty"
    TIMED_OUT_FALLBACK_EMPTY = "outline_draft_timed_out_fallback_empty"
