"""Shared upstream/provider failure classification helpers."""

from __future__ import annotations

from typing import Any


def describe_upstream_failure(exc: Exception) -> dict[str, Any]:
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
            "message": "上游提供方鉴权失败或配置错误",
            "retryable": False,
            "raw_message": raw_message,
        }

    if (
        "not configured" in lowered
        or "provider_unavailable" in lowered
        or "missing api key" in lowered
        or "no provider" in lowered
        or "not set" in lowered
    ):
        return {
            "failure_type": "config_error",
            "message": "上游提供方配置缺失或不可用",
            "retryable": False,
            "raw_message": raw_message,
        }

    if "timeout" in lowered or "timed out" in lowered or "deadline exceeded" in lowered:
        return {
            "failure_type": "timeout",
            "message": "上游提供方响应超时",
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
            "message": "上游提供方暂不可用",
            "retryable": True,
            "raw_message": raw_message,
        }

    return {
        "failure_type": "completion_error",
        "message": "上游提供方调用失败",
        "retryable": True,
        "raw_message": raw_message,
    }


def classify_upstream_failure(exc: Exception) -> str:
    return describe_upstream_failure(exc)["failure_type"]
