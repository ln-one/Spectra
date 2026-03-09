"""
LlamaParse Provider — 基于 LlamaParse 云端 API 的文档解析实现。

通过 ``DOCUMENT_PARSER=llamaparse`` 启用。
需要安装 ``llama-parse`` 包并配置 ``LLAMAPARSE_API_KEY``。
"""

from __future__ import annotations

import logging
import os
from typing import Any

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)


class LlamaParseProvider(BaseParseProvider):
    """LlamaParse 云端解析器 provider"""

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
        self.api_key = os.getenv("LLAMAPARSE_API_KEY", "")
        if not self.api_key:
            raise ProviderNotAvailableError(
                "LLAMAPARSE_API_KEY 未配置。请在 .env 中设置，"
                "或将 DOCUMENT_PARSER 设为 local 使用本地轻量解析。"
            )

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        """
        使用 LlamaParse 云端 API 解析文件。

        Returns:
            (text, details) - 解析的文本和详情字典
        """
        details: dict[str, Any] = {"pages_extracted": 0, "text_length": 0}

        try:
            from llama_parse import LlamaParse

            # 初始化 parser
            parser = LlamaParse(
                api_key=self.api_key,
                result_type="markdown",
                verbose=False,
            )

            # 解析文件
            documents = parser.load_data(filepath)

            if documents:
                # 合并所有文档内容
                text = "\n\n".join(doc.text for doc in documents)
                details["text_length"] = len(text)
                details["pages_extracted"] = len(documents)
                logger.info(
                    "LlamaParse 成功解析文件 %s，提取 %d 页，%d 字符",
                    filename,
                    details["pages_extracted"],
                    details["text_length"],
                )
                return text, details
            else:
                logger.warning("LlamaParse 解析文件 %s 返回空内容", filename)
                return "", details

        except Exception as exc:
            logger.error(
                "LlamaParse 解析文件 %s 失败: %s", filename, exc, exc_info=True
            )
            # 返回空文本，让上层 fallback 处理
            return "", details
