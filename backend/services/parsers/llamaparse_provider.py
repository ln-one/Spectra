"""
LlamaParse Provider — 基于 LlamaParse 云端 API 的文档解析骨架。

当前为预留实现，真正集成将在下一阶段完成。
需要安装 ``llama-parse`` 包并配置 ``LLAMAPARSE_API_KEY``。
通过 ``DOCUMENT_PARSER=llamaparse`` 启用。
"""

from __future__ import annotations

import logging
import os
from typing import Any

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)


class LlamaParseProvider(BaseParseProvider):
    """LlamaParse 云端解析器 provider（预留骨架）。"""

    name = "llamaparse"
    supported_types = {"pdf", "word", "ppt"}

    def __init__(self) -> None:
        # 检测 SDK 可用性
        try:
            import llama_parse  # noqa: F401
        except ImportError as exc:
            raise ProviderNotAvailableError(
                "llama-parse 未安装。请通过 `pip install llama-parse` 安装，"
                "或将 DOCUMENT_PARSER 设为 local 使用本地轻量解析。"
            ) from exc

        # 检测 API Key
        api_key = os.getenv("LLAMAPARSE_API_KEY", "")
        if not api_key:
            raise ProviderNotAvailableError(
                "LLAMAPARSE_API_KEY 未配置。请在 .env 中设置，"
                "或将 DOCUMENT_PARSER 设为 local 使用本地轻量解析。"
            )

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        """
        使用 LlamaParse 云端 API 解析文件。

        当前为骨架实现，返回空文本以便上层走 fallback。
        """
        details: dict[str, Any] = {"pages_extracted": 0, "text_length": 0}
        # TODO: 下一阶段实现 LlamaParse 调用逻辑
        # 1. 使用 llama_parse.LlamaParse 解析文件
        # 2. 填充 pages_extracted / text_length
        logger.warning(
            "LlamaParse provider 尚未完成集成，文件 %s 将由上层 fallback 处理",
            filename,
        )
        return "", details
