from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.generation_session_service.tool_content_builder_fallbacks import (
    SUPPORTED_CARD_IDS,
    card_query_text,
    fallback_content,
    fallback_content_async,
    fallback_simulator_turn_result,
)
from services.generation_session_service.tool_content_builder_support import (
    build_error_details as _build_error_details,
)
from services.generation_session_service.tool_content_builder_support import (
    build_schema_hint as _build_schema_hint,
)
from services.generation_session_service.tool_content_builder_support import (
    parse_ai_object_payload as _parse_ai_object_payload,
)
from services.generation_session_service.tool_content_builder_support import (
    raise_generation_error as _raise_generation_error,
)
from services.generation_session_service.tool_content_builder_support import (
    validate_card_payload as _validate_card_payload,
)
from services.generation_session_service.tool_content_builder_support import (
    validate_simulator_turn_payload as _validate_simulator_turn_payload,
)
from services.project_space_service import project_space_service
from services.system_settings_service import system_settings_service
from utils.exceptions import APIException, ErrorCode

logger = logging.getLogger(__name__)

_FALLBACK_MODE_ENV = "STUDIO_TOOL_FALLBACK_MODE"
_FALLBACK_MODE_STRICT = "strict"
_FALLBACK_MODE_ALLOW = "allow"


def _resolve_fallback_mode() -> str:
    raw = str(os.getenv(_FALLBACK_MODE_ENV, _FALLBACK_MODE_STRICT)).strip().lower()
    if raw in {_FALLBACK_MODE_STRICT, _FALLBACK_MODE_ALLOW}:
        return raw
    return _FALLBACK_MODE_STRICT


def _allow_fallback() -> bool:
    return _resolve_fallback_mode() == _FALLBACK_MODE_ALLOW


def _should_attempt_ai_generation() -> bool:
    raw = os.getenv("STUDIO_TOOL_ENABLE_AI_GENERATION")
    if raw is None:
        return True
    return raw.strip().lower() not in {"0", "false", "no"}


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
) -> str | None:
    if not source_artifact_id:
        return None
    try:
        artifact = await project_space_service.get_artifact(source_artifact_id)
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


async def _generate_structured_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
) -> dict[str, Any]:
    if not _should_attempt_ai_generation():
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

    schema_hint = _build_schema_hint(card_id)
    if not schema_hint:
        _raise_generation_error(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="Unsupported studio card for structured generation.",
            card_id=card_id,
            model=None,
            phase="preflight",
            failure_reason="unsupported_card",
            retryable=False,
        )

    prompt = (
        "You are a teaching tool content generator.\n"
        "Return ONLY a JSON object. Do not include markdown fences.\n"
        f"Card type: {card_id}\n"
        f"Config: {json.dumps(config, ensure_ascii=False)}\n"
        f"Source artifact hint: {source_hint or 'none'}\n"
        f"RAG snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Requirements:\n"
        "- Output must be directly usable for artifact persistence.\n"
        "- Avoid placeholders, empty strings, and empty arrays.\n"
        "- Keep semantics educational and concrete.\n"
        f"Expected JSON shape example: {schema_hint}\n"
    )

    try:
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            has_rag_context=bool(rag_snippets),
            max_tokens=1600,
        )
    except APIException as exc:
        details = dict(exc.details or {})
        model_name = str(
            details.get("resolved_model")
            or details.get("requested_model")
            or ai_service.large_model
            or ""
        )
        details.update(
            _build_error_details(
                card_id=card_id,
                model=model_name,
                phase="generate",
                failure_reason=str(details.get("failure_type") or "upstream_error"),
                retryable=bool(exc.retryable),
            )
        )
        raise APIException(
            status_code=exc.status_code,
            error_code=exc.error_code,
            message=exc.message,
            details=details,
            retryable=exc.retryable,
        ) from exc
    except Exception as exc:
        _raise_generation_error(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="AI generation failed with an unexpected runtime error.",
            card_id=card_id,
            model=ai_service.large_model,
            phase="generate",
            failure_reason="unexpected_runtime_error",
            retryable=True,
            extra={"raw_error": str(exc)[:300]},
        )

    model_name = str(response.get("model") or ai_service.large_model or "")
    payload = _parse_ai_object_payload(
        card_id=card_id,
        ai_raw=str(response.get("content") or ""),
        model=model_name,
        phase="parse",
    )
    try:
        _validate_card_payload(card_id, payload)
    except ValueError as exc:
        _raise_generation_error(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="AI payload failed studio card schema validation.",
            card_id=card_id,
            model=model_name,
            phase="validate",
            failure_reason=str(exc),
            retryable=False,
        )
    return payload


async def build_studio_tool_artifact_content(
    *,
    card_id: str,
    project_id: str,
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
        _load_source_artifact_hint(source_artifact_id=source_artifact_id),
    )
    allow_fallback = _allow_fallback()
    logger.info(
        "studio tool generation mode card_id=%s fallback_mode=%s",
        card_id,
        _resolve_fallback_mode(),
    )
    if not allow_fallback:
        return await _generate_structured_content(
            card_id=card_id,
            config=cfg,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        )

    ai_payload = None
    try:
        ai_payload = await _generate_structured_content(
            card_id=card_id,
            config=cfg,
            rag_snippets=rag_snippets,
            source_hint=source_hint,
        )
    except Exception as exc:
        logger.warning(
            "studio tool fallback mode activated card_id=%s reason=%s",
            card_id,
            exc,
        )

    fallback_payload = await fallback_content_async(
        card_id=card_id,
        config=cfg,
        rag_snippets=rag_snippets,
        source_hint=source_hint,
        source_artifact_id=source_artifact_id,
    )
    if not ai_payload:
        return fallback_payload
    merged = dict(fallback_payload)
    for key, value in ai_payload.items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


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

    if not _should_attempt_ai_generation():
        if _allow_fallback():
            return fallback_simulator_turn_result(
                current_content=current_content,
                teacher_answer=teacher_answer,
                config=cfg,
                turn_anchor=turn_anchor,
                rag_snippets=rag_snippets,
            )
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

    prompt = (
        "You are a classroom QA simulator generator.\n"
        "Return ONLY a JSON object with keys: turn_result, updated_content.\n"
        "Do not include markdown fences.\n"
        f"Current artifact content: {json.dumps(current_content, ensure_ascii=False)}\n"
        f"Teacher answer: {teacher_answer}\n"
        f"Config: {json.dumps(cfg, ensure_ascii=False)}\n"
        f"RAG snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Constraints:\n"
        "- updated_content must be a complete artifact payload.\n"
        "- turn_result must include turn_anchor, student_profile, "
        "student_question, feedback.\n"
        "- Do not output empty strings for required fields.\n"
    )

    if not _allow_fallback():
        try:
            response = await ai_service.generate(
                prompt=prompt,
                route_task=ModelRouteTask.LESSON_PLAN_REASONING,
                has_rag_context=bool(rag_snippets),
                max_tokens=1800,
            )
        except APIException as exc:
            details = dict(exc.details or {})
            model_name = str(
                details.get("resolved_model")
                or details.get("requested_model")
                or ai_service.large_model
                or ""
            )
            details.update(
                _build_error_details(
                    card_id="classroom_qa_simulator",
                    model=model_name,
                    phase="generate_turn",
                    failure_reason=str(details.get("failure_type") or "upstream_error"),
                    retryable=bool(exc.retryable),
                )
            )
            raise APIException(
                status_code=exc.status_code,
                error_code=exc.error_code,
                message=exc.message,
                details=details,
                retryable=exc.retryable,
            ) from exc

        model_name = str(response.get("model") or ai_service.large_model or "")
        payload = _parse_ai_object_payload(
            card_id="classroom_qa_simulator",
            ai_raw=str(response.get("content") or ""),
            model=model_name,
            phase="parse_turn",
        )
        try:
            _validate_simulator_turn_payload(payload)
        except ValueError as exc:
            _raise_generation_error(
                status_code=400,
                error_code=ErrorCode.INVALID_INPUT,
                message="AI payload failed simulator turn schema validation.",
                card_id="classroom_qa_simulator",
                model=model_name,
                phase="validate_turn",
                failure_reason=str(exc),
                retryable=False,
            )
        return payload["updated_content"], payload["turn_result"]

    try:
        response = await ai_service.generate(
            prompt=prompt,
            route_task=ModelRouteTask.LESSON_PLAN_REASONING,
            has_rag_context=bool(rag_snippets),
            max_tokens=1800,
        )
        payload = _parse_ai_object_payload(
            card_id="classroom_qa_simulator",
            ai_raw=str(response.get("content") or ""),
            model=str(response.get("model") or ai_service.large_model or ""),
            phase="parse_turn",
        )
        _validate_simulator_turn_payload(payload)
        return payload["updated_content"], payload["turn_result"]
    except Exception as exc:
        logger.warning("simulator turn fallback mode activated reason=%s", exc)
        return fallback_simulator_turn_result(
            current_content=current_content,
            teacher_answer=teacher_answer,
            config=cfg,
            turn_anchor=turn_anchor,
            rag_snippets=rag_snippets,
        )
