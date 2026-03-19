from __future__ import annotations

from enum import Enum


class OutlineGenerationErrorCode(str, Enum):
    TIMEOUT = "OUTLINE_GENERATION_TIMEOUT"
    FAILED = "OUTLINE_GENERATION_FAILED"


class OutlineGenerationStateReason(str, Enum):
    DRAFTED_ASYNC = "outline_drafted_async"
    FAILED_FALLBACK_EMPTY = "outline_draft_failed_fallback_empty"
    TIMED_OUT_FALLBACK_EMPTY = "outline_draft_timed_out_fallback_empty"
