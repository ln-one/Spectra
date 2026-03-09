"""
Video Service — 视频理解能力封装（基于 Qwen-VL）。

对齐 D2_QWEN_VL_SPEC_V1.md 规范。
"""

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
    SourceReference,
    SourceType,
)

logger = logging.getLogger(__name__)

# 环境变量配置
QWEN_VL_MODEL = os.getenv("QWEN_VL_MODEL", "qwen-vl-max")
VIDEO_FRAME_INTERVAL = int(os.getenv("VIDEO_FRAME_INTERVAL", "30"))


def process_video(
    filepath: str, filename: str
) -> tuple[list[dict[str, Any]], CapabilityStatus]:
    """
    处理视频文件，提取结构化片段。

    Args:
        filepath: 视频文件路径
        filename: 文件名
    Returns:
        (segments, capability_status)
        segments: 结构化片段列表，每个包含 timestamp, content, confidence
    """
    trace_id = f"trc_{uuid.uuid4().hex[:12]}"
    segments: list[dict[str, Any]] = []
    file_size = 0
    try:
        file_size = Path(filepath).stat().st_size
    except Exception:
        file_size = 0

    try:
        api_key = os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise ValueError("provider_unavailable: DASHSCOPE_API_KEY not set")

        from dashscope import MultiModalConversation

        messages = [
            {
                "role": "user",
                "content": [
                    {"video": f"file://{filepath}"},
                    {
                        "text": (
                            "请提取该教学视频的关键内容，输出简要摘要。"
                            "如果无法识别，请返回空字符串。"
                        )
                    },
                ],
            }
        ]
        response = MultiModalConversation.call(
            model=QWEN_VL_MODEL,
            messages=messages,
            api_key=api_key,
        )

        text = ""
        if hasattr(response, "output") and getattr(response, "output", None):
            output = getattr(response, "output")
            choices = getattr(output, "choices", None)
            if choices and isinstance(choices, list):
                first_choice = choices[0]
                if isinstance(first_choice, dict):
                    message = first_choice.get("message", {})
                else:
                    message = getattr(first_choice, "message", {}) or {}
                if isinstance(message, dict):
                    content = message.get("content")
                else:
                    content = getattr(message, "content", None)
                if isinstance(content, list):
                    text_parts: list[str] = []
                    for item in content:
                        if isinstance(item, dict) and item.get("text"):
                            text_parts.append(str(item["text"]).strip())
                    text = " ".join([p for p in text_parts if p]).strip()
                elif isinstance(content, str):
                    text = content.strip()

        if text:
            segments = [
                {
                    "timestamp": 0.0,
                    "content": text,
                    "confidence": 0.8,
                    "chunk_id": f"vid_{uuid.uuid4().hex[:8]}",
                }
            ]
            capability_status = CapabilityStatus(
                capability=CapabilityType.VIDEO_UNDERSTANDING,
                provider="Qwen-VL",
                status=CapabilityStatusEnum.AVAILABLE,
                fallback_used=False,
                reason_code=None,
                user_message=None,
                trace_id=trace_id,
            )
            return segments, capability_status

        raise ValueError("empty_output: qwen-vl returned empty content")

    except Exception as exc:
        logger.warning("Qwen-VL 调用失败，进入降级路径: %s", exc)

        exc_text = str(exc).lower()
        reason_code = ReasonCode.INTERNAL_ERROR
        if "provider_unavailable" in exc_text:
            reason_code = ReasonCode.PROVIDER_UNAVAILABLE
        elif "timeout" in exc_text:
            reason_code = ReasonCode.PROVIDER_TIMEOUT
        elif "rate" in exc_text or "429" in exc_text:
            reason_code = ReasonCode.PROVIDER_RATE_LIMITED
        elif "empty_output" in exc_text or "empty" in exc_text:
            reason_code = ReasonCode.EMPTY_OUTPUT

        # 降级：基于文件元信息生成可继续流转的保底片段（非占位假识别）
        segments = [
            {
                "timestamp": 0.0,
                "content": (
                    f"已接收视频文件《{filename}》，当前无法完成画面语义解析。"
                    "请在对话中补充关键片段说明后继续生成。"
                ),
                "confidence": 0.3,
                "chunk_id": f"vid_{uuid.uuid4().hex[:8]}",
            }
        ]

        capability_status = CapabilityStatus(
            capability=CapabilityType.VIDEO_UNDERSTANDING,
            provider="Qwen-VL",
            status=CapabilityStatusEnum.DEGRADED,
            fallback_used=True,
            fallback_target="metadata_parser",
            reason_code=reason_code,
            user_message=(
                f"视频理解暂不可用（{filename}, {file_size} bytes），"
                "已切换保底解析，结果可能缺少画面细节。"
            ),
            trace_id=trace_id,
        )

        return segments, capability_status


def create_video_sources(
    segments: list[dict[str, Any]], filename: str
) -> list[SourceReference]:
    """
    将视频片段转换为来源引用。

    Args:
        segments: 视频片段列表
        filename: 文件名

    Returns:
        来源引用列表
    """
    sources = []
    for seg in segments:
        source = SourceReference(
            chunk_id=seg.get("chunk_id", f"vid_{uuid.uuid4().hex[:8]}"),
            source_type=SourceType.VIDEO,
            filename=filename,
            timestamp=seg.get("timestamp", 0.0),
            content_preview=seg.get("content", "")[:100],
        )
        sources.append(source)

    return sources
