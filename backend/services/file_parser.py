"""
File Parser Service — 可插拔解析器的统一入口。

通过 ``DOCUMENT_PARSER`` 环境变量切换解析 provider（与 ADR-005 一致）。
默认使用 ``local`` provider（pypdf / python-docx / python-pptx）。

本模块实现完整的 fallback chain 与降级信息返回。
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Any

from schemas.common import (
    CapabilityStatus,
    CapabilityStatusEnum,
    CapabilityType,
    ReasonCode,
)
from services.parsers import get_parser

logger = logging.getLogger(__name__)

# 纯文本扩展名：由入口层直接读取，不委托给外部 provider
_PLAIN_TEXT_EXTENSIONS = {".txt", ".md", ".csv"}

# 降级提示文案
_DEGRADATION_MESSAGES = {
    "mineru_to_llamaparse": "MinerU 解析暂不可用，已切换到 LlamaParse 云端解析。",
    "mineru_to_local": "高级解析暂不可用，已切换基础解析，版面结构与公式识别可能不完整。",
    "llamaparse_to_local": "云端解析暂不可用，已切换本地解析，结果可能有格式差异。",
}

# 主备链路定义（按优先级）
_FALLBACK_CHAIN = {
    "mineru": ["llamaparse", "local"],
    "llamaparse": ["mineru", "local"],
    "local": [],
}


def _resolve_fallback_chain(primary_provider_name: str | None) -> list[str]:
    """
    Return fallback providers for the configured primary provider.

    Unknown providers should still degrade to local parser.
    """
    primary = (primary_provider_name or "local").strip().lower()
    chain = list(_FALLBACK_CHAIN.get(primary, []))
    if primary != "local" and "local" not in chain:
        chain.append("local")
    return chain


def extract_text_for_rag(
    filepath: str, filename: str, file_type: str
) -> tuple[str, dict]:
    """
    从文件中提取可用于 RAG 的文本及解析详情。

    Returns:
        (text, parse_details) - parse_details 包含 capability_status 字段
    """
    details: dict[str, Any] = {}

    # 图片占位逻辑 —— 不走解析器 provider
    if file_type == "image":
        text = f"图片资料：{filename}。该图片可作为课堂讲解示例或视觉辅助素材。"
        details["images_extracted"] = 1
        details["text_length"] = len(text)
        return text, details

    if file_type == "video":
        from services.video_service import create_video_sources, process_video

        segments, capability_status = process_video(filepath, filename)
        sources = [src.model_dump() for src in create_video_sources(segments, filename)]
        lines: list[str] = []
        for seg in segments:
            content = str(seg.get("content", "")).strip()
            if not content:
                continue
            timestamp = float(seg.get("timestamp", 0.0) or 0.0)
            lines.append(f"[{timestamp:.1f}s] {content}")
        text = "\n".join(lines).strip()
        if not text:
            text = f"视频资料：{filename}。当前仅完成元信息解析。"
        details["duration"] = max(
            [float(seg.get("timestamp", 0.0) or 0.0) for seg in segments] or [0.0]
        )
        details["segments"] = segments
        details["sources"] = sources
        details["capability_status"] = capability_status.model_dump()
        details["text_length"] = len(text)
        return text, details

    # 纯文本短路：按扩展名直接读取
    ext = Path(filepath).suffix.lower()
    if ext in _PLAIN_TEXT_EXTENSIONS:
        text = Path(filepath).read_text(encoding="utf-8", errors="replace")
        return text, {"text_length": len(text)}

    # 实现 fallback chain：主 provider -> 备选 -> local
    trace_id = f"trc_{uuid.uuid4().hex[:12]}"
    primary_provider_name = None
    capability_status = None

    try:
        # 尝试主 provider
        primary_provider_name = os.getenv("DOCUMENT_PARSER", "local").strip().lower()
        parser = get_parser(primary_provider_name)

        # 显式指定 provider 时，若 registry 自动回退到 local，需要保留回退链语义。
        if parser.name != primary_provider_name and primary_provider_name != "local":
            raise ValueError(f"provider_unavailable:{primary_provider_name}")

        # 若当前 provider 不支持该文件类型，交给 fallback chain 处理
        if not parser.supports(file_type) and parser.name != "local":
            logger.warning(
                "Provider %s 不支持 file_type=%s，尝试 fallback chain",
                parser.name,
                file_type,
            )
            raise ValueError(f"unsupported_file_type:{file_type}")

        text, parse_details = parser.extract_text(filepath, filename, file_type)

        # 检查解析结果
        if text and len(text.strip()) > 0:
            # 成功
            capability_status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider=parser.name,
                status=CapabilityStatusEnum.AVAILABLE,
                fallback_used=False,
                trace_id=trace_id,
            ).model_dump()
            details.update(parse_details)
            details["capability_status"] = capability_status
            return text, details

        # local 为空时，保留 parse_details 返回，避免丢失 pages_extracted 等字段
        # （例如空白 PDF 或损坏文件场景）
        if parser.name == "local":
            capability_status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider="local",
                status=CapabilityStatusEnum.AVAILABLE,
                fallback_used=False,
                trace_id=trace_id,
            ).model_dump()
            details.update(parse_details)
            details["capability_status"] = capability_status
            return "", details

        # 非 local 主 provider 返回空内容，继续 fallback
        logger.warning("Provider %s 返回空内容，尝试 fallback", primary_provider_name)
        raise ValueError("Empty output from primary provider")

    except Exception as exc:
        # 主 provider 失败，尝试 fallback chain
        logger.warning(
            "Provider %s 失败: %s，尝试 fallback chain",
            primary_provider_name,
            exc,
        )

        # 获取 fallback 链
        fallback_providers = _resolve_fallback_chain(primary_provider_name)

        last_empty_details: dict[str, Any] | None = None
        last_empty_provider: str | None = None

        for fallback_name in fallback_providers:
            try:
                logger.info("尝试 fallback 到 %s", fallback_name)
                fallback_parser = get_parser(fallback_name)

                # 避免 registry 自动回退 local 导致“假命中”。
                if fallback_parser.name != fallback_name and fallback_name != "local":
                    logger.warning(
                        "Fallback provider %s 不可用（resolved=%s），跳过",
                        fallback_name,
                        fallback_parser.name,
                    )
                    continue

                # 检查是否支持该文件类型
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
                    # 降级成功
                    reason_code = ReasonCode.PROVIDER_UNAVAILABLE
                    exc_msg = str(exc).lower()
                    if "timeout" in exc_msg:
                        reason_code = ReasonCode.PROVIDER_TIMEOUT
                    elif "empty" in exc_msg:
                        reason_code = ReasonCode.EMPTY_OUTPUT
                    elif "unsupported_file_type" in exc_msg:
                        reason_code = ReasonCode.UNSUPPORTED_FILE_TYPE

                    # 生成降级提示
                    degradation_key = f"{primary_provider_name}_to_{fallback_name}"
                    user_message = _DEGRADATION_MESSAGES.get(
                        degradation_key,
                        f"{primary_provider_name} 解析失败，已切换到 {fallback_name}。",
                    )

                    capability_status = CapabilityStatus(
                        capability=CapabilityType.DOCUMENT_PARSER,
                        provider=fallback_name,
                        status=CapabilityStatusEnum.DEGRADED,
                        fallback_used=True,
                        fallback_target=fallback_name,
                        reason_code=reason_code,
                        user_message=user_message,
                        trace_id=trace_id,
                    ).model_dump()

                    details.update(parse_details)
                    details["capability_status"] = capability_status
                    return text, details
                else:
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

        # 所有 provider 都失败
        logger.error(
            "所有解析器都失败，文件 %s",
            filename,
            exc_info=True,
        )

        if last_empty_details:
            details.update(last_empty_details)

        capability_status = CapabilityStatus(
            capability=CapabilityType.DOCUMENT_PARSER,
            provider=last_empty_provider or primary_provider_name or "unknown",
            status=CapabilityStatusEnum.UNAVAILABLE,
            fallback_used=False,
            reason_code=ReasonCode.EMPTY_OUTPUT,
            user_message=f"文件 {filename} 解析失败，请检查文件格式或稍后重试。",
            trace_id=trace_id,
        ).model_dump()

        details["capability_status"] = capability_status
        # 返回空文本，但保留 capability_status 供上层处理
        return "", details
