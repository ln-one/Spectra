"""
File Parser Service — 可插拔解析器的统一入口。

通过 ``DOCUMENT_PARSER`` 环境变量切换解析 provider（与 ADR-005 一致）。
默认使用 ``local`` provider（pypdf / python-docx / python-pptx）。

本模块保留 ``extract_text_for_rag()`` 函数签名不变，
确保上层 ``rag_indexing_service.py`` 零改动。
图片/视频占位逻辑不属于解析器职责，仍保留在本模块。
"""

from __future__ import annotations

from typing import Any

from services.parsers import get_parser


def extract_text_for_rag(
    filepath: str, filename: str, file_type: str
) -> tuple[str, dict]:
    """
    从文件中提取可用于 RAG 的文本及解析详情。

    签名与返回结构与 MVP 阶段完全一致，内部委托给可插拔 provider。

    Returns:
        (text, parse_details)
    """
    details: dict[str, Any] = {}

    # 图片/视频占位逻辑 —— 不走解析器 provider
    if file_type == "image":
        text = f"图片资料：{filename}。该图片可作为课堂讲解示例或视觉辅助素材。"
        details["images_extracted"] = 1
        details["text_length"] = len(text)
        return text, details

    if file_type == "video":
        text = f"视频资料：{filename}。该视频可用于课堂案例演示与讨论。"
        details["duration"] = 0
        details["text_length"] = len(text)
        return text, details

    # 委托给可插拔解析器 provider
    parser = get_parser()
    text, details = parser.extract_text(filepath, filename, file_type)
    return text, details
