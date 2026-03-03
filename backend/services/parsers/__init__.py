"""
可插拔文档解析器包。

使用方式::

    from services.parsers import get_parser

    parser = get_parser()  # 读取 DOCUMENT_PARSER 环境变量，默认 local
    text, details = parser.extract_text(filepath, filename, file_type)
"""

from .base import BaseParseProvider, ProviderNotAvailableError
from .registry import get_parser, register_provider

__all__ = [
    "BaseParseProvider",
    "ProviderNotAvailableError",
    "get_parser",
    "register_provider",
]
