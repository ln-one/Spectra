"""Provider fallback helpers for file parsing."""

from __future__ import annotations

import logging
from typing import Any, Callable

from schemas.common import (
    CapabilityStatus,
    CapabilityStatusEnum,
    CapabilityType,
    ReasonCode,
)

from .constants import _DEGRADATION_MESSAGES, _FALLBACK_CHAIN

logger = logging.getLogger(__name__)


def resolve_fallback_chain(primary_provider_name: str | None) -> list[str]:
    """Return fallback providers for the configured primary provider."""
    primary = (primary_provider_name or "local").strip().lower()
    chain = list(_FALLBACK_CHAIN.get(primary, []))
    if primary != "local" and "local" not in chain:
        chain.append("local")
    return chain


def build_available_status(provider: str, trace_id: str) -> dict[str, Any]:
    return CapabilityStatus(
        capability=CapabilityType.DOCUMENT_PARSER,
        provider=provider,
        status=CapabilityStatusEnum.AVAILABLE,
        fallback_used=False,
        trace_id=trace_id,
    ).model_dump(mode="json")


def build_degraded_status(
    *,
    primary_provider_name: str | None,
    fallback_name: str,
    trace_id: str,
    exc: Exception,
) -> dict[str, Any]:
    reason_code = ReasonCode.PROVIDER_UNAVAILABLE
    exc_msg = str(exc).lower()
    if "timeout" in exc_msg:
        reason_code = ReasonCode.PROVIDER_TIMEOUT
    elif "empty" in exc_msg:
        reason_code = ReasonCode.EMPTY_OUTPUT
    elif "unsupported_file_type" in exc_msg:
        reason_code = ReasonCode.UNSUPPORTED_FILE_TYPE

    degradation_key = f"{primary_provider_name}_to_{fallback_name}"
    user_message = _DEGRADATION_MESSAGES.get(
        degradation_key,
        f"{primary_provider_name} 解析失败，已切换到 {fallback_name}。",
    )

    return CapabilityStatus(
        capability=CapabilityType.DOCUMENT_PARSER,
        provider=fallback_name,
        status=CapabilityStatusEnum.DEGRADED,
        fallback_used=True,
        fallback_target=fallback_name,
        reason_code=reason_code,
        user_message=user_message,
        trace_id=trace_id,
    ).model_dump(mode="json")


def build_unavailable_status(
    *,
    filename: str,
    trace_id: str,
    primary_provider_name: str | None,
    last_empty_provider: str | None,
) -> dict[str, Any]:
    return CapabilityStatus(
        capability=CapabilityType.DOCUMENT_PARSER,
        provider=last_empty_provider or primary_provider_name or "unknown",
        status=CapabilityStatusEnum.UNAVAILABLE,
        fallback_used=False,
        reason_code=ReasonCode.EMPTY_OUTPUT,
        user_message=f"文件 {filename} 解析失败，请检查文件格式或稍后重试。",
        trace_id=trace_id,
    ).model_dump(mode="json")


def extract_with_fallback(
    *,
    filepath: str,
    filename: str,
    file_type: str,
    trace_id: str,
    details: dict[str, Any],
    primary_provider_name: str | None,
    exc: Exception,
    get_parser: Callable[[str | None], Any],
) -> tuple[str, dict[str, Any]]:
    logger.warning(
        "Provider %s 失败: %s，尝试 fallback chain",
        primary_provider_name,
        exc,
    )

    fallback_providers = resolve_fallback_chain(primary_provider_name)
    last_empty_details: dict[str, Any] | None = None
    last_empty_provider: str | None = None

    for fallback_name in fallback_providers:
        try:
            logger.info("尝试 fallback 到 %s", fallback_name)
            fallback_parser = get_parser(fallback_name)

            if fallback_parser.name != fallback_name and fallback_name != "local":
                logger.warning(
                    "Fallback provider %s 不可用（resolved=%s），跳过",
                    fallback_name,
                    fallback_parser.name,
                )
                continue

            if not fallback_parser.supports(file_type):
                logger.warning(
                    "Fallback provider %s 不支持 file_type=%s，跳过",
                    fallback_name,
                    file_type,
                )
                continue

            text, parse_details = fallback_parser.extract_text(
                filepath, filename, file_type
            )
            if text and len(text.strip()) > 0:
                details.update(parse_details)
                details["capability_status"] = build_degraded_status(
                    primary_provider_name=primary_provider_name,
                    fallback_name=fallback_name,
                    trace_id=trace_id,
                    exc=exc,
                )
                return text, details

            logger.warning(
                "Fallback provider %s 返回空内容，继续尝试下一个",
                fallback_name,
            )
            if isinstance(parse_details, dict):
                last_empty_details = parse_details
                last_empty_provider = fallback_name
        except Exception as fallback_exc:
            logger.warning(
                "Fallback provider %s 失败: %s，继续尝试下一个",
                fallback_name,
                fallback_exc,
            )
            continue

    logger.error("所有解析器都失败，文件 %s", filename, exc_info=True)
    if last_empty_details:
        details.update(last_empty_details)
    details["capability_status"] = build_unavailable_status(
        filename=filename,
        trace_id=trace_id,
        primary_provider_name=primary_provider_name,
        last_empty_provider=last_empty_provider,
    )
    return "", details
