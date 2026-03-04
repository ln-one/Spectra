"""
MinerU Provider — 基于 MinerU (Magic-PDF) 的文档解析骨架。

当前为预留实现，真正集成将在下一阶段完成。
需要安装 ``magic-pdf`` 包后方可使用。
通过 ``DOCUMENT_PARSER=mineru`` 启用。
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)


class MinerUProvider(BaseParseProvider):
    """MinerU (Magic-PDF) 解析器 provider（预留骨架）。"""

    name = "mineru"
    supported_types = {"pdf"}

    def __init__(self) -> None:
        # 实例化时检测依赖是否可用
        try:
            import magic_pdf  # noqa: F401
        except ImportError as exc:
            raise ProviderNotAvailableError(
                "MinerU (magic-pdf) 未安装。请通过 `pip install magic-pdf` 安装，"
                "或将 DOCUMENT_PARSER 设为 local 使用本地轻量解析。"
            ) from exc

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        """
        使用 MinerU 解析文件并返回 Markdown 文本。

        当前为骨架实现，返回空文本以便上层走 fallback。
        """
        details: dict[str, Any] = {"pages_extracted": 0, "text_length": 0}
        # TODO: 下一阶段实现 MinerU 调用逻辑
        # 1. 使用 magic_pdf 解析 PDF → 结构化 Markdown
        # 2. 填充 pages_extracted / text_length
        logger.warning(
            "MinerU provider 尚未完成集成，文件 %s 将由上层 fallback 处理",
            filename,
        )
        return "", details
