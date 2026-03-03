"""
Parser Provider 注册表与工厂函数。

通过环境变量 ``DOCUMENT_PARSER`` 选择解析器 provider（与 ADR-005 一致）。

合法值：
  - ``local``      — 本地轻量解析（默认）
  - ``mineru``     — MinerU (Magic-PDF)
  - ``llamaparse`` — LlamaParse 云端 API

Fallback 策略（精准边界）：
  仅在 **provider 不可用 / 未安装 / 未配置** 时回退到 ``local``。
  解析执行失败（文件损坏等）由 provider 自身返回空文本 + 详情，
  上层 ``rag_indexing_service`` 负责统一占位 fallback。
"""

from __future__ import annotations

import logging
import os
from typing import Callable

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)

# 延迟导入 provider，避免在模块加载时触发依赖检查
_PROVIDER_FACTORIES: dict[str, Callable[[], BaseParseProvider]] = {}


def _register_builtin_providers() -> None:
    """注册内置 provider 工厂函数（延迟导入）。"""

    def _make_local() -> BaseParseProvider:
        from .local_provider import LocalProvider

        return LocalProvider()

    def _make_mineru() -> BaseParseProvider:
        from .mineru_provider import MinerUProvider

        return MinerUProvider()

    def _make_llamaparse() -> BaseParseProvider:
        from .llamaparse_provider import LlamaParseProvider

        return LlamaParseProvider()

    _PROVIDER_FACTORIES["local"] = _make_local
    _PROVIDER_FACTORIES["mineru"] = _make_mineru
    _PROVIDER_FACTORIES["llamaparse"] = _make_llamaparse


# 模块加载时注册
_register_builtin_providers()


def register_provider(name: str, factory: Callable[[], BaseParseProvider]) -> None:
    """
    注册自定义 provider 工厂。

    用于扩展：第三方可调用此函数注入新 provider，无需修改 registry 内部代码。
    """
    _PROVIDER_FACTORIES[name] = factory


def get_parser(provider_name: str | None = None) -> BaseParseProvider:
    """
    获取解析器 provider 实例。

    Args:
        provider_name: 显式指定 provider 名称。
                       为 ``None`` 时读取环境变量 ``DOCUMENT_PARSER``，默认 ``"local"``。

    Returns:
        可用的 provider 实例。若指定 provider 不可用则自动回退到 ``local``。
    """
    name = provider_name or os.getenv("DOCUMENT_PARSER", "local")

    factory = _PROVIDER_FACTORIES.get(name)
    if factory is None:
        logger.warning("未知的 DOCUMENT_PARSER=%s，回退到 local", name)
        return _PROVIDER_FACTORIES["local"]()

    try:
        return factory()
    except ProviderNotAvailableError as exc:
        logger.warning("Provider %s 不可用（%s），回退到 local", name, exc)
        return _PROVIDER_FACTORIES["local"]()
