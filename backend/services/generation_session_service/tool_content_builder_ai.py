from __future__ import annotations

from typing import Any

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from utils.exceptions import APIException, ErrorCode

from .tool_content_builder_support import build_error_details, parse_ai_object_payload, raise_generation_error


async def _generate_card_response(
    *,
    prompt: str,
    card_id: str,
    phase: str,
    rag_snippets: list[str],
    max_tokens: int,
    route_task: ModelRouteTask | str = ModelRouteTask.LESSON_PLAN_REASONING,
    response_format: dict[str, Any] | None = None,
    model: str | None = None,
    timeout_seconds_override: float | None = None,
) -> tuple[dict[str, Any], str]:
    try:
        response = await ai_service.generate(
            prompt=prompt,
            model=model,
            route_task=route_task,
            has_rag_context=bool(rag_snippets),
            max_tokens=max_tokens,
            response_format=response_format,
            timeout_seconds_override=timeout_seconds_override,
        )
    except APIException as exc:
        details = dict(exc.details or {})
        model_name = str(
            details.get("resolved_model")
            or details.get("requested_model")
            or model
            or ai_service.large_model
            or ""
        )
        details.update(
            build_error_details(
                card_id=card_id,
                model=model_name,
                phase=phase,
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
        raise_generation_error(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="AI generation failed with an unexpected runtime error.",
            card_id=card_id,
            model=model or ai_service.large_model,
            phase=phase,
            failure_reason="unexpected_runtime_error",
            retryable=True,
            extra={"raw_error": str(exc)[:300]},
        )

    model_name = str(response.get("model") or model or ai_service.large_model or "")
    return response, model_name


async def generate_card_json_payload(
    *,
    prompt: str,
    card_id: str,
    phase: str,
    rag_snippets: list[str],
    max_tokens: int,
    route_task: ModelRouteTask | str = ModelRouteTask.LESSON_PLAN_REASONING,
    model: str | None = None,
    response_format: dict[str, Any] | None = None,
    timeout_seconds_override: float | None = None,
) -> tuple[dict, str]:
    response, model_name = await _generate_card_response(
        prompt=prompt,
        card_id=card_id,
        phase=phase,
        rag_snippets=rag_snippets,
        max_tokens=max_tokens,
        route_task=route_task,
        model=model,
        response_format=response_format or {"type": "json_object"},
        timeout_seconds_override=timeout_seconds_override,
    )
    return (
        parse_ai_object_payload(
            card_id=card_id,
            ai_raw=str(response.get("content") or ""),
            model=model_name,
            phase="parse" if phase == "generate" else "parse_turn",
        ),
        model_name,
    )


async def generate_card_json_payload_with_meta(
    *,
    prompt: str,
    card_id: str,
    phase: str,
    rag_snippets: list[str],
    max_tokens: int,
    route_task: ModelRouteTask | str = ModelRouteTask.LESSON_PLAN_REASONING,
    model: str | None = None,
    response_format: dict[str, Any] | None = None,
    timeout_seconds_override: float | None = None,
) -> tuple[dict, str, dict[str, Any]]:
    response, model_name = await _generate_card_response(
        prompt=prompt,
        card_id=card_id,
        phase=phase,
        rag_snippets=rag_snippets,
        max_tokens=max_tokens,
        route_task=route_task,
        model=model,
        response_format=response_format or {"type": "json_object"},
        timeout_seconds_override=timeout_seconds_override,
    )
    return (
        parse_ai_object_payload(
            card_id=card_id,
            ai_raw=str(response.get("content") or ""),
            model=model_name,
            phase="parse" if phase == "generate" else "parse_turn",
        ),
        model_name,
        response,
    )


async def generate_card_text_payload(
    *,
    prompt: str,
    card_id: str,
    phase: str,
    rag_snippets: list[str],
    max_tokens: int,
    route_task: ModelRouteTask | str = ModelRouteTask.LESSON_PLAN_REASONING,
    model: str | None = None,
    timeout_seconds_override: float | None = None,
) -> tuple[str, str, dict[str, Any]]:
    response, model_name = await _generate_card_response(
        prompt=prompt,
        card_id=card_id,
        phase=phase,
        rag_snippets=rag_snippets,
        max_tokens=max_tokens,
        route_task=route_task,
        model=model,
        response_format=None,
        timeout_seconds_override=timeout_seconds_override,
    )
    content = str(response.get("content") or "").strip()
    if not content:
        raise_generation_error(
            status_code=502,
            error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            message="AI returned empty content for studio card generation.",
            card_id=card_id,
            model=model_name,
            phase="parse",
            failure_reason="empty_text_payload",
            retryable=True,
        )
    return content, model_name, response
