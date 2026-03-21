"""Runtime orchestration for routed AI text completion."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from services.ai.completion_runtime import (
    build_completion_payload,
    build_stub_payload,
    extract_completion_payload,
    normalize_route_task_value,
    raise_external_service_error,
    should_retry_completion_error,
    with_route_failure,
)
from services.ai.model_resolution import _resolve_model_name
from services.ai.model_router import ModelRouteFailureReason, ModelRouteTask
from services.ai.retry_runtime import retry_transient_completion
from services.ai.service_support import resolve_requested_model

logger = logging.getLogger(__name__)


async def generate_with_routing(
    service,
    *,
    prompt: str,
    model: Optional[str] = None,
    route_task: Optional[ModelRouteTask | str] = None,
    has_rag_context: bool = False,
    max_tokens: Optional[int] = 500,
) -> dict:
    started_at = time.perf_counter()

    def _elapsed_ms() -> float:
        return round((time.perf_counter() - started_at) * 1000.0, 2)

    route_decision, requested_model, normalized_route_task = resolve_requested_model(
        model_router=service.model_router,
        default_model=service.default_model,
        model=model,
        route_task=route_task,
        prompt=prompt,
        has_rag_context=has_rag_context,
    )
    resolved_model = requested_model
    fallback_triggered = False
    fallback_model = route_decision.fallback_model if route_decision else None
    timeout_seconds = service._resolve_timeout_seconds(route_task)
    retry_attempts = 0
    fallback_target = None

    try:
        resolved_model = _resolve_model_name(requested_model)
        logger.info(
            "AI generate invoked: requested_model=%s resolved_model=%s "
            "route_task=%s timeout_seconds=%s",
            requested_model,
            resolved_model,
            normalized_route_task,
            timeout_seconds,
        )
        response = await service._run_completion(
            model=resolved_model,
            prompt=prompt,
            max_tokens=max_tokens,
            timeout_seconds=timeout_seconds,
        )
        content, tokens_used = extract_completion_payload(response)
        latency_ms = _elapsed_ms()
        route_info = route_decision.to_dict() if route_decision else None
        if route_info is not None:
            route_info["latency_ms"] = latency_ms
        return build_completion_payload(
            content=content,
            model=resolved_model,
            tokens_used=tokens_used,
            route=route_info,
            fallback_triggered=fallback_triggered,
            latency_ms=latency_ms,
        )
    except asyncio.TimeoutError as exc:
        logger.warning(
            "AI generation timed out after %.1fs with %s",
            timeout_seconds,
            resolved_model,
            exc_info=True,
        )
        if fallback_model and fallback_model != requested_model:
            try:
                fallback_resolved = _resolve_model_name(fallback_model)
                logger.info(
                    "Attempting fallback after timeout: %s -> %s",
                    resolved_model,
                    fallback_resolved,
                )
                response = await service._run_completion(
                    model=fallback_resolved,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    timeout_seconds=timeout_seconds,
                )
                content, tokens_used = extract_completion_payload(response)
                fallback_triggered = True
                route_info = (
                    with_route_failure(
                        route_decision,
                        failure_reason=ModelRouteFailureReason.TIMEOUT,
                        latency_ms=_elapsed_ms(),
                        fallback_triggered=True,
                        original_model=resolved_model,
                        fallback_target=fallback_resolved,
                    )
                    or {}
                )
                return build_completion_payload(
                    content=content,
                    model=fallback_resolved,
                    tokens_used=tokens_used,
                    route=route_info,
                    fallback_triggered=fallback_triggered,
                    latency_ms=route_info["latency_ms"],
                )
            except Exception as fallback_exc:
                logger.error(
                    "Fallback to %s after timeout also failed: %s",
                    fallback_model,
                    fallback_exc,
                    exc_info=True,
                )

        if service.allow_ai_stub:
            latency_ms = _elapsed_ms()
            route_info = with_route_failure(
                route_decision,
                failure_reason=ModelRouteFailureReason.TIMEOUT,
                latency_ms=latency_ms,
            )
            return build_stub_payload(
                prompt=prompt,
                model=resolved_model,
                route=route_info,
                fallback_triggered=fallback_triggered,
                latency_ms=latency_ms,
            )
        raise_external_service_error(
            exc=exc,
            requested_model=requested_model,
            resolved_model=resolved_model,
            route_task=normalize_route_task_value(normalized_route_task),
            fallback_triggered=fallback_triggered,
            fallback_target=fallback_target,
            retry_attempts=retry_attempts,
        )
    except Exception as exc:
        logger.warning(
            "AI generation failed with %s: %s",
            resolved_model,
            str(exc),
            exc_info=True,
        )
        if service.upstream_retry_attempts > 0 and should_retry_completion_error(exc):
            try:
                response, retry_attempts = await retry_transient_completion(
                    run_completion=service._run_completion,
                    model=resolved_model,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    timeout_seconds=timeout_seconds,
                    retry_attempts=service.upstream_retry_attempts,
                    retry_delay_seconds=service.upstream_retry_delay_seconds,
                    logger=logger,
                )
                content, tokens_used = extract_completion_payload(response)
                route_info = (
                    with_route_failure(
                        route_decision,
                        failure_reason=ModelRouteFailureReason.COMPLETION_ERROR,
                        latency_ms=_elapsed_ms(),
                        original_model=resolved_model,
                        retry_attempts=retry_attempts,
                    )
                    or {}
                )
                route_info["retry_succeeded"] = True
                return build_completion_payload(
                    content=content,
                    model=resolved_model,
                    tokens_used=tokens_used,
                    route=route_info,
                    fallback_triggered=fallback_triggered,
                    latency_ms=route_info["latency_ms"],
                )
            except Exception as retry_exc:
                exc = retry_exc

        if fallback_model and fallback_model != requested_model:
            try:
                fallback_resolved = _resolve_model_name(fallback_model)
                fallback_target = fallback_resolved
                logger.info(
                    "Attempting fallback: %s -> %s",
                    resolved_model,
                    fallback_resolved,
                )
                response = await service._run_completion(
                    model=fallback_resolved,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    timeout_seconds=timeout_seconds,
                )
                content, tokens_used = extract_completion_payload(response)
                fallback_triggered = True
                route_info = (
                    with_route_failure(
                        route_decision,
                        failure_reason=ModelRouteFailureReason.COMPLETION_ERROR,
                        latency_ms=_elapsed_ms(),
                        fallback_triggered=True,
                        original_model=resolved_model,
                        fallback_target=fallback_resolved,
                        retry_attempts=retry_attempts,
                    )
                    or {}
                )
                return build_completion_payload(
                    content=content,
                    model=fallback_resolved,
                    tokens_used=tokens_used,
                    route=route_info,
                    fallback_triggered=fallback_triggered,
                    latency_ms=route_info["latency_ms"],
                )
            except Exception as fallback_exc:
                logger.error(
                    "Fallback to %s also failed: %s",
                    fallback_model,
                    fallback_exc,
                    exc_info=True,
                )

        if service.allow_ai_stub:
            latency_ms = _elapsed_ms()
            route_info = with_route_failure(
                route_decision,
                failure_reason=ModelRouteFailureReason.COMPLETION_ERROR,
                latency_ms=latency_ms,
            )
            return build_stub_payload(
                prompt=prompt,
                model=resolved_model,
                route=route_info,
                fallback_triggered=fallback_triggered,
                latency_ms=latency_ms,
            )
        raise_external_service_error(
            exc=exc,
            requested_model=requested_model,
            resolved_model=resolved_model,
            route_task=normalize_route_task_value(normalized_route_task),
            fallback_triggered=fallback_triggered,
            fallback_target=fallback_target,
            retry_attempts=retry_attempts,
        )
