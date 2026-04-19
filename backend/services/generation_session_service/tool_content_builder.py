from __future__ import annotations

import asyncio
import logging
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


async def _load_rag_snippets(
    *,
    project_id: str,
    query: str,
    rag_source_ids: list[str] | None,
) -> list[str]:
    timeout_seconds = system_settings_service.resolve_chat_rag_timeout_seconds()
    filters = {"file_ids": rag_source_ids} if rag_source_ids else None
    try:
        coroutine = ai_service._retrieve_rag_context(
            project_id=project_id,
            query=query,
            top_k=4,
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
    for item in results or []:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "").strip()
        if content:
            snippets.append(content[:400])
    return snippets[:3]


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
