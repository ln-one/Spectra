"""File Parser Service — 可插拔解析器的统一入口。

通过 ``DOCUMENT_PARSER`` 环境变量切换解析 provider（与 ADR-005 一致）。
默认使用 ``local`` provider（pypdf / python-docx / python-pptx）。

本模块实现完整的 fallback chain 与降级信息返回。
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from services.file_upload_service.access import FileType, normalize_file_type
from services.parsers import get_parser

from .constants import AUTO_PARSER_MODE
from .direct_extractors import (
    extract_image_placeholder,
    extract_plain_text,
    extract_video_placeholder,
)
from .fallback import build_available_status, extract_with_fallback

logger = logging.getLogger(__name__)


def _resolve_configured_parser_mode() -> str:
    configured = os.getenv("DOCUMENT_PARSER", "local").strip().lower()
    return configured or "local"


def _resolve_primary_provider(parser_mode: str, file_type: FileType) -> str:
    """Resolve runtime provider from parser mode and normalized file type."""
    if parser_mode != AUTO_PARSER_MODE:
        return parser_mode

    if file_type == FileType.PDF:
        return "mineru_cloud"
    return "local"


def extract_text_for_rag(
    filepath: str, filename: str, file_type: str
) -> tuple[str, dict[str, Any]]:
    """从文件中提取可用于 RAG 的文本及解析详情。"""
    normalized_file_type = normalize_file_type(file_type)
    details: dict[str, Any] = {}

    if normalized_file_type == FileType.IMAGE:
        return extract_image_placeholder(filename)

    if normalized_file_type == FileType.VIDEO:
        return extract_video_placeholder(filepath, filename)

    plain_text = extract_plain_text(filepath)
    if plain_text is not None:
        return plain_text

    trace_id = f"trc_{uuid.uuid4().hex[:12]}"
    primary_provider_name = None

    try:
        parser_mode = _resolve_configured_parser_mode()
        primary_provider_name = _resolve_primary_provider(
            parser_mode, normalized_file_type
        )
        details["parser_routing"] = {
            "mode": parser_mode,
            "primary_provider": primary_provider_name,
            "file_type": normalized_file_type.value,
        }
        details["provider_attempted"] = [primary_provider_name]
        parser = get_parser(primary_provider_name)

        if parser.name != primary_provider_name and primary_provider_name != "local":
            raise ValueError(f"provider_unavailable:{primary_provider_name}")

        if not parser.supports(normalized_file_type.value) and parser.name != "local":
            logger.warning(
                "Provider %s 不支持 file_type=%s，尝试 fallback chain",
                parser.name,
                normalized_file_type.value,
            )
            raise ValueError(f"unsupported_file_type:{normalized_file_type.value}")

        text, parse_details = parser.extract_text(
            filepath, filename, normalized_file_type.value
        )
        details.update(parse_details)
        if text and len(text.strip()) > 0:
            details["provider_used"] = parser.name
            details["capability_status"] = build_available_status(parser.name, trace_id)
            return text, details

        if parser.name == "local":
            details["provider_used"] = "local"
            details["capability_status"] = build_available_status("local", trace_id)
            return "", details

        logger.warning("Provider %s 返回空内容，尝试 fallback", primary_provider_name)
        raise ValueError("Empty output from primary provider")

    except Exception as exc:
        return extract_with_fallback(
            filepath=filepath,
            filename=filename,
            file_type=normalized_file_type.value,
            trace_id=trace_id,
            details=details,
            primary_provider_name=primary_provider_name,
            exc=exc,
            get_parser=get_parser,
        )
