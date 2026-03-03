"""
解析器抽象基类。

所有 parse provider 必须继承 ``BaseParseProvider`` 并实现 ``extract_text``。

返回值契约（与 OpenAPI parse_details 对齐）
-----------------------------------------
``extract_text`` 返回 ``(text, details)``，其中 ``details`` 应尽量包含：

* ``pages_extracted``  – int，提取的页数
* ``images_extracted`` – int，提取的图片数
* ``text_length``      – int，提取的文本长度
* ``duration``         – float，视频时长（秒），仅视频类型

异常处理约定
-----------
* 如果 provider 自身不可用（依赖缺失、API Key 缺失等），
  应在实例化阶段抛出 ``ProviderNotAvailableError``，由 registry 统一处理回退。
* 解析执行期间的失败（文件损坏、超时等），provider 应 **捕获异常并返回空文本 + 错误详情**，
  由上层 ``rag_indexing_service`` 统一走占位 fallback，保持现有语义稳定。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ProviderNotAvailableError(Exception):
    """Provider 不可用（依赖缺失、API Key 未配置等）。"""


class BaseParseProvider(ABC):
    """解析器 provider 抽象基类。"""

    name: str = ""
    """Provider 唯一标识，如 ``"local"`` / ``"mineru"`` / ``"llamaparse"``。"""

    supported_types: set[str] = set()
    """该 provider 支持解析的 file_type 集合，如 ``{"pdf", "word", "ppt"}``。"""

    @abstractmethod
    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        """
        从文件中提取文本及解析详情。

        Args:
            filepath: 文件在服务器的绝对路径。
            filename: 原始文件名（含扩展名）。
            file_type: 业务层文件类型标识（``"pdf"`` / ``"word"`` / ``"ppt"`` 等）。

        Returns:
            ``(text, details)`` — 解析文本与详情字典。
            详情字典标准字段见模块级 docstring。
        """
        ...  # pragma: no cover

    def supports(self, file_type: str) -> bool:
        """判断当前 provider 是否支持指定文件类型。"""
        return file_type in self.supported_types
