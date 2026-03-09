"""
MinerU Provider — 基于 MinerU (Magic-PDF) 的文档解析实现。

通过 ``DOCUMENT_PARSER=mineru`` 启用。
需要安装 ``magic-pdf`` 包并配置相关依赖。
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)


class MinerUProvider(BaseParseProvider):
    """MinerU (Magic-PDF) 解析器 provider"""

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
        使用 MinerU 解析 PDF 文件并返回 Markdown 文本。

        Returns:
            (text, details) - 解析的文本和详情字典
        """
        details: dict[str, Any] = {"pages_extracted": 0, "text_length": 0}

        try:
            from magic_pdf.pipe.UNIPipe import UNIPipe
            from magic_pdf.rw.DiskReaderWriter import DiskReaderWriter

            # 创建临时输出目录
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)

                # 读取 PDF 文件
                pdf_bytes = Path(filepath).read_bytes()

                # 初始化 writer
                writer = DiskReaderWriter(str(temp_path))

                # 创建 UNIPipe 实例并解析
                pipe = UNIPipe(pdf_bytes, {"_pdf_type": ""}, writer)
                pipe.pipe_classify()
                pipe.pipe_parse()

                # 获取 Markdown 结果
                md_content = pipe.pipe_mk_markdown(str(temp_path), drop_mode="none")

                if md_content:
                    text = md_content
                    details["text_length"] = len(text)
                    # 尝试估算页数（基于分页符或内容长度）
                    details["pages_extracted"] = text.count("\n---\n") + 1
                    logger.info(
                        "MinerU 成功解析文件 %s，提取 %d 字符",
                        filename,
                        details["text_length"],
                    )
                    return text, details
                else:
                    logger.warning("MinerU 解析文件 %s 返回空内容", filename)
                    return "", details

        except Exception as exc:
            logger.error("MinerU 解析文件 %s 失败: %s", filename, exc, exc_info=True)
            # 返回空文本，让上层 fallback 处理
            return "", details
