from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any

from services.ai import ai_service
from services.generation_session_service.tool_content_builder_fallbacks import (
    SUPPORTED_CARD_IDS,
    card_query_text,
)
from services.generation_session_service.simulator_turn_generation import (
    generate_simulator_turn_update,
)
from services.generation_session_service.tool_content_builder_policy import (
    allow_fallback,
    resolve_fallback_mode,
    should_attempt_ai_generation,
)
from services.generation_session_service.tool_content_builder_routing import (
    resolve_card_artifact_builder,
)
from services.generation_session_service.tool_content_builder_support import (
    raise_generation_error as _raise_generation_error,
)
from services.project_space_service.service import project_space_service
from services.system_settings_service import system_settings_service
from utils.exceptions import ErrorCode

logger = logging.getLogger(__name__)

_RAG_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_RAG_SYMBOL_RUN_RE = re.compile(r"[`~^|<>]{3,}")
_RAG_MULTI_PUNC_RE = re.compile(r"[，。；：、,.;:!?！？]{4,}")


def _env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
        return value if value > 0 else default
    except ValueError:
        return default


def _resolve_word_rag_budget() -> tuple[int, int, int]:
    top_k = _env_positive_int("WORD_LESSON_PLAN_RAG_TOPK", 8)
    snippet_chars = _env_positive_int("WORD_LESSON_PLAN_RAG_SNIPPET_CHARS", 900)
    max_snippets = _env_positive_int("WORD_LESSON_PLAN_RAG_MAX_SNIPPETS", 6)
    return top_k, snippet_chars, max_snippets


def _resolve_mindmap_rag_budget() -> tuple[int, int, int]:
    top_k = _env_positive_int("MINDMAP_RAG_TOPK", 10)
    snippet_chars = _env_positive_int("MINDMAP_RAG_SNIPPET_CHARS", 850)
    max_snippets = _env_positive_int("MINDMAP_RAG_MAX_SNIPPETS", 8)
    return top_k, snippet_chars, max_snippets


def _sanitize_rag_text(text: str) -> str:
    candidate = str(text or "")
    candidate = candidate.replace("\r\n", "\n").replace("\r", "\n")
    candidate = _RAG_CONTROL_RE.sub("", candidate)
    candidate = _RAG_SYMBOL_RUN_RE.sub(" ", candidate)
    candidate = _RAG_MULTI_PUNC_RE.sub("。", candidate)
    lines = [line.strip() for line in candidate.splitlines()]
    cleaned_lines: list[str] = []
    for line in lines:
        if not line:
            continue
        symbols = sum(1 for ch in line if not ch.isalnum() and not ("\u4e00" <= ch <= "\u9fff"))
        if len(line) >= 12 and symbols / max(len(line), 1) > 0.55:
            continue
        cleaned_lines.append(line)
    normalized = " ".join(cleaned_lines)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _should_skip_animation_rag_item(item: dict[str, Any]) -> bool:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    source_type = str(
        item.get("source_type") or metadata.get("source_type") or ""
    ).strip().lower()
    filename = str(item.get("filename") or "").strip().lower()
    source_tool_type = str(metadata.get("source_artifact_tool_type") or "").strip().lower()
    source_artifact_type = str(metadata.get("source_artifact_type") or "").strip().lower()

    if source_type == "ai_generated":
        return True
    if filename in {"ai_generated", "ai-generated"}:
        return True
    if source_tool_type in {"animation", "demonstration_animations"}:
        return True
    if source_artifact_type in {"gif", "html", "animation_storyboard"}:
        return True
    return False


async def _load_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
    card_id: str | None = None,
) -> list[str]:
    if card_id == "demonstration_animations" and not rag_source_ids:
        # Animation mainline defaults to prompt-driven generation.
        # Do not pull broad library snippets when the user did not bind sources.
        return []

    if card_id == "word_document":
        top_k, snippet_chars, max_snippets = _resolve_word_rag_budget()
    elif card_id == "knowledge_mindmap":
        top_k, snippet_chars, max_snippets = _resolve_mindmap_rag_budget()
    else:
        top_k, snippet_chars, max_snippets = 4, 400, 3
    timeout_seconds = system_settings_service.resolve_chat_rag_timeout_seconds()
    filters = {"file_ids": rag_source_ids} if rag_source_ids else None
    try:
        coroutine = ai_service._retrieve_rag_context(
            project_id=project_id,
            query=query,
            top_k=top_k,
            score_threshold=0.3,
            session_id=None,
            filters=filters,
        )
        results = (
            await asyncio.wait_for(coroutine, timeout=timeout_seconds)
            if timeout_seconds > 0
            else await coroutine
        )
    except Exception as exc:
        logger.warning(
            "studio tool rag loading failed for project=%s error=%s",
            project_id,
            exc,
        )
        return []

    snippets: list[str] = []
    seen: set[str] = set()
    for item in results or []:
        if not isinstance(item, dict):
            continue
        if card_id == "demonstration_animations" and _should_skip_animation_rag_item(
            item
        ):
            continue
        content = _sanitize_rag_text(str(item.get("content") or ""))
        if content:
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            source_label = (
                str(item.get("filename") or "").strip()
                or str(metadata.get("source_artifact_title") or "").strip()
                or str(metadata.get("source_type") or "").strip()
            )
            snippet = content[:snippet_chars]
            if source_label:
                snippet = f"[来源:{source_label}] {snippet}"
            dedup_key = re.sub(r"\s+", "", snippet.lower())[:240]
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            snippets.append(snippet)
    return snippets[:max_snippets]


async def _load_source_artifact_hint(
    *,
    source_artifact_id: str | None,
    user_id: str,
) -> str | None:
    if not source_artifact_id:
        return None
    try:
        artifact = await project_space_service.get_artifact(
            source_artifact_id,
            user_id=user_id,
        )
    except Exception as exc:
        logger.warning(
            "failed to load source artifact %s: %s",
            source_artifact_id,
            exc,
        )
        return None
    if not artifact:
        return None
    metadata = getattr(artifact, "metadata", None)
    if isinstance(metadata, dict):
        title = str(metadata.get("title") or "").strip()
        if title:
            return f"{title} ({artifact.type})"
    return f"{artifact.type}:{artifact.id}"


async def build_studio_tool_artifact_content(
    *,
    card_id: str,
    project_id: str,
    user_id: str,
    config: dict[str, Any] | None,
    source_artifact_id: str | None = None,
    rag_source_ids: list[str] | None = None,
) -> dict[str, Any] | None:
    if card_id not in SUPPORTED_CARD_IDS:
        return None
    cfg = dict(config or {})
    query = card_query_text(card_id, cfg)
    rag_snippets, source_hint = await asyncio.gather(
        _load_rag_snippets(
            project_id=project_id,
            query=query,
            rag_source_ids=rag_source_ids,
            card_id=card_id,
        ),
        _load_source_artifact_hint(
            source_artifact_id=source_artifact_id,
            user_id=user_id,
        ),
    )
    logger.info(
        "studio tool generation mode card_id=%s fallback_mode=%s",
        card_id,
        resolve_fallback_mode(),
    )
    if not should_attempt_ai_generation():
        _raise_generation_error(
            status_code=503,
            error_code=ErrorCode.UPSTREAM_UNAVAILABLE,
            message="Studio AI generation is disabled by runtime configuration.",
            card_id=card_id,
            model=None,
            phase="generate",
            failure_reason="ai_generation_disabled",
            retryable=False,
        )
    artifact_builder = resolve_card_artifact_builder(card_id)
    try:
        return await artifact_builder(
            card_id=card_id,
            config=cfg,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
            source_artifact_id=source_artifact_id,
            rag_source_ids=rag_source_ids,
        )
    except Exception as exc:
        if allow_fallback():
            logger.warning(
                "studio tool allow mode failed without content fallback "
                "card_id=%s reason=%s",
                card_id,
                exc,
            )
        raise


async def build_studio_simulator_turn_update(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any] | None,
    project_id: str,
    rag_source_ids: list[str] | None = None,
    turn_anchor: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    cfg = dict(config or {})
    query = str(
        cfg.get("topic")
        or current_content.get("question_focus")
        or current_content.get("title")
        or "classroom qa simulation"
    )
    rag_snippets = await _load_rag_snippets(
        project_id=project_id,
        query=query,
        rag_source_ids=rag_source_ids,
        card_id="classroom_qa_simulator",
    )

    if turn_anchor:
        logger.info("studio simulator turn anchor requested anchor=%s", turn_anchor)
    if not should_attempt_ai_generation():
        _raise_generation_error(
            status_code=503,
            error_code=ErrorCode.UPSTREAM_UNAVAILABLE,
            message=(
                "Studio simulator turn generation is disabled by runtime "
                "configuration."
            ),
            card_id="classroom_qa_simulator",
            model=None,
            phase="generate",
            failure_reason="ai_generation_disabled",
            retryable=False,
        )
    try:
        return await generate_simulator_turn_update(
            current_content=current_content,
            teacher_answer=teacher_answer,
            config=cfg,
            rag_snippets=rag_snippets,
        )
    except Exception as exc:
        if allow_fallback():
            logger.warning(
                "studio simulator allow mode failed without turn fallback " "reason=%s",
                exc,
            )
        raise
