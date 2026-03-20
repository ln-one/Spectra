from __future__ import annotations

from typing import Any

from services.ai.model_router import ModelRouteFailureReason


def with_route_failure(
    route_decision,
    *,
    failure_reason: ModelRouteFailureReason,
    latency_ms: float,
    fallback_triggered: bool = False,
    original_model: str | None = None,
) -> dict[str, Any] | None:
    route_info = route_decision.to_dict() if route_decision else None
    if route_info is None:
        return None
    route_info["failure_reason"] = failure_reason.value
    route_info["latency_ms"] = latency_ms
    if fallback_triggered:
        route_info["fallback_triggered"] = True
    if original_model:
        route_info["original_model"] = original_model
    return route_info


def build_completion_payload(
    *,
    content: str,
    model: str,
    tokens_used: int | None,
    route: dict[str, Any] | None,
    fallback_triggered: bool,
    latency_ms: float,
) -> dict[str, Any]:
    return {
        "content": content,
        "model": model,
        "tokens_used": tokens_used,
        "route": route,
        "fallback_triggered": fallback_triggered,
        "latency_ms": latency_ms,
    }


def build_stub_payload(
    *,
    prompt: str,
    model: str,
    route: dict[str, Any] | None,
    fallback_triggered: bool,
    latency_ms: float,
) -> dict[str, Any]:
    return build_completion_payload(
        content=f"AI stub response for prompt: {prompt[:50]}...",
        model=model,
        tokens_used=0,
        route=route,
        fallback_triggered=fallback_triggered,
        latency_ms=latency_ms,
    )


def extract_completion_payload(response) -> tuple[str, int | None]:
    content = response.choices[0].message.content
    tokens_used = response.usage.total_tokens if hasattr(response, "usage") else None
    return content, tokens_used
