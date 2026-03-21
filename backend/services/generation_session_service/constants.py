from __future__ import annotations

from enum import Enum


class OutlineGenerationErrorCode(str, Enum):
    TIMEOUT = "OUTLINE_GENERATION_TIMEOUT"
    FAILED = "OUTLINE_GENERATION_FAILED"


class OutlineGenerationStateReason(str, Enum):
    DRAFTED_ASYNC = "outline_drafted_async"
    FAILED_FALLBACK_EMPTY = "outline_draft_failed_fallback_empty"
    TIMED_OUT_FALLBACK_EMPTY = "outline_draft_timed_out_fallback_empty"


class OutlineChangeReason(str, Enum):
    DRAFTED_ASYNC = "drafted_async"
    DRAFT_FAILED_FALLBACK_EMPTY = "draft_failed_fallback_empty"


class SessionLifecycleReason(str, Enum):
    SESSION_CREATED = "session_created"
    SESSION_REUSED = "session_reused"
    OUTLINE_CONFIRMED = "outline_confirmed"


class DispatchFallbackReason(str, Enum):
    TASK_QUEUE_UNAVAILABLE = "task_queue_unavailable_fallback_local_execution"
    TASK_QUEUE_NO_WORKER = "task_queue_no_worker_fallback_local_execution"
    QUEUE_HEALTH_UNKNOWN = "queue_health_unknown_fallback_local_execution"
    TASK_ENQUEUE_FAILED = "task_enqueue_failed_fallback_local_execution"
    RQ_JOB_FAILED = "rq_job_failed_fallback_local_execution"


class DispatchMode(str, Enum):
    LOCAL_ASYNC = "local_async"


class SessionOutputType(str, Enum):
    PPT = "ppt"
    WORD = "word"
    BOTH = "both"
