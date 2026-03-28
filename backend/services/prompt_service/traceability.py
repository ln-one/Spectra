"""Shared prompt/retrieval traceability metadata."""

from __future__ import annotations

from typing import Iterable

RETRIEVAL_MODE_DEFAULT_LIBRARY = "default_library"
RETRIEVAL_MODE_STRICT_SOURCES = "strict_sources"

PROMPT_POLICY_VERSION = "prompt-policy-v2026-03-28"
PROMPT_BASELINE_ID = "prompt-baseline-v1"


def resolve_retrieval_mode(rag_source_ids: Iterable[str] | None) -> str:
    if not rag_source_ids:
        return RETRIEVAL_MODE_DEFAULT_LIBRARY
    return RETRIEVAL_MODE_STRICT_SOURCES


def build_prompt_traceability(
    *,
    rag_source_ids: Iterable[str] | None = None,
) -> dict[str, str]:
    return {
        "retrieval_mode": resolve_retrieval_mode(rag_source_ids),
        "policy_version": PROMPT_POLICY_VERSION,
        "baseline_id": PROMPT_BASELINE_ID,
    }
