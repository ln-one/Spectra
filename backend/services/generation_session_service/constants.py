from __future__ import annotations

from enum import Enum


class OutlineGenerationErrorCode(str, Enum):
    TIMEOUT = "OUTLINE_GENERATION_TIMEOUT"
    FAILED = "OUTLINE_GENERATION_FAILED"


class OutlineGenerationStateReason(str, Enum):
    DRAFTED_ASYNC = "outline_drafted_async"
    FAILED = "outline_draft_failed"
    TIMED_OUT = "outline_draft_timed_out"
    FAILED_FALLBACK_EMPTY = "outline_draft_failed_fallback_empty"
    TIMED_OUT_FALLBACK_EMPTY = "outline_draft_timed_out_fallback_empty"


class OutlineChangeReason(str, Enum):
    DRAFTED_ASYNC = "drafted_async"
    DRAFT_FAILED_FALLBACK_EMPTY = "draft_failed_fallback_empty"


class SessionLifecycleReason(str, Enum):
    SESSION_CREATED = "session_created"
    SESSION_REUSED = "session_reused"
    OUTLINE_CONFIRMED = "outline_confirmed"


class SessionOutputType(str, Enum):
    PPT = "ppt"
    WORD = "word"
    BOTH = "both"
