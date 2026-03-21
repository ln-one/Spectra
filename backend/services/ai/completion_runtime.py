from __future__ import annotations

from typing import Any

from services.ai.model_router import ModelRouteFailureReason
from utils.exceptions import ErrorCode, ExternalServiceException


def with_route_failure(
    route_decision,
    *,
    failure_reason: ModelRouteFailureReason,
    latency_ms: float,
    fallback_triggered: bool = False,
    original_model: str | None = None,
    fallback_target: str | None = None,
    retry_attempts: int = 0,
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
    if fallback_target:
        route_info["fallback_target"] = fallback_target
    if retry_attempts > 0:
        route_info["retry_attempts"] = retry_attempts
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


def normalize_route_task_value(route_task) -> str | None:
    return str(route_task) if route_task is not None else None


def describe_completion_error(exc: Exception) -> dict[str, Any]:
    raw_message = str(exc).strip() or exc.__class__.__name__
    lowered = raw_message.lower()

    if (
        "invalid api key" in lowered
        or "unauthorized" in lowered
        or "authentication" in lowered
        or "access denied" in lowered
        or "permission denied" in lowered
        or "api key" in lowered
        and ("invalid" in lowered or "missing" in lowered)
    ):
        return {
            "failure_type": "auth_error",
            "message": "上游模型提供方鉴权失败或配置错误",
            "retryable": False,
            "raw_message": raw_message,
        }

    if (
        "not configured" in lowered
        or "provider_unavailable" in lowered
        or "missing api key" in lowered
        or "no provider" in lowered
    ):
        return {
            "failure_type": "config_error",
            "message": "上游模型提供方配置缺失或不可用",
            "retryable": False,
            "raw_message": raw_message,
        }

    if "timeout" in lowered or "timed out" in lowered or "deadline exceeded" in lowered:
        return {
            "failure_type": "timeout",
            "message": "上游模型响应超时",
            "retryable": True,
            "raw_message": raw_message,
        }

    if (
        "service unavailable" in lowered
        or "temporarily unavailable" in lowered
        or "connection" in lowered
        or "network" in lowered
        or "bad gateway" in lowered
        or "rate limit" in lowered
        or "429" in lowered
        or "503" in lowered
    ):
        return {
            "failure_type": "provider_unavailable",
            "message": "上游模型提供方暂不可用",
            "retryable": True,
            "raw_message": raw_message,
        }

    return {
        "failure_type": "completion_error",
        "message": "上游模型调用失败",
        "retryable": True,
        "raw_message": raw_message,
    }


def should_retry_completion_error(exc: Exception) -> bool:
    error_info = describe_completion_error(exc)
    return bool(error_info["retryable"]) and error_info["failure_type"] != "timeout"


def raise_external_service_error(
    *,
    exc: Exception,
    requested_model: str,
    resolved_model: str,
    route_task: str | None,
    fallback_triggered: bool,
    fallback_target: str | None = None,
    retry_attempts: int = 0,
) -> None:
    error_info = describe_completion_error(exc)
    failure_type = error_info["failure_type"]
    details = {
        "failure_type": failure_type,
        "requested_model": requested_model,
        "resolved_model": resolved_model,
        "route_task": route_task,
        "fallback_triggered": fallback_triggered,
        "fallback_target": fallback_target,
        "retry_attempts": retry_attempts,
        "provider_message": error_info["raw_message"],
    }

    if failure_type == "auth_error":
        raise ExternalServiceException(
            message=error_info["message"],
            status_code=503,
            error_code=ErrorCode.UPSTREAM_AUTH_ERROR,
            details=details,
            retryable=False,
        ) from exc
    if failure_type == "config_error":
        raise ExternalServiceException(
            message=error_info["message"],
            status_code=503,
            error_code=ErrorCode.UPSTREAM_CONFIG_ERROR,
            details=details,
            retryable=False,
        ) from exc
    if failure_type == "timeout":
        raise ExternalServiceException(
            message=error_info["message"],
            status_code=504,
            error_code=ErrorCode.UPSTREAM_TIMEOUT,
            details=details,
            retryable=True,
        ) from exc
    raise ExternalServiceException(
        message=error_info["message"],
        status_code=502,
        error_code=ErrorCode.UPSTREAM_UNAVAILABLE,
        details=details,
        retryable=bool(error_info["retryable"]),
    ) from exc
