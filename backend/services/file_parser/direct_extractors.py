"""Direct extraction shortcuts that do not require document providers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .constants import _PLAIN_TEXT_EXTENSIONS


def extract_image_placeholder(filename: str) -> tuple[str, dict[str, Any]]:
    text = f"图片资料：{filename}。该图片可作为课堂讲解示例或视觉辅助素材。"
    return text, {"images_extracted": 1, "text_length": len(text)}


def extract_video_placeholder(
    filepath: str, filename: str
) -> tuple[str, dict[str, Any]]:
    from services.video_service import create_video_sources, process_video

    segments, capability_status = process_video(filepath, filename)
    sources = [
        src.model_dump(mode="json") for src in create_video_sources(segments, filename)
    ]
    lines: list[str] = []
    for seg in segments:
        content = str(seg.get("content", "")).strip()
        if not content:
            continue
        timestamp = float(seg.get("timestamp", 0.0) or 0.0)
        lines.append(f"[{timestamp:.1f}s] {content}")
    text = "\n".join(lines).strip()
    if not text:
        text = f"视频资料：{filename}。当前仅完成元信息解析。"
    details: dict[str, Any] = {
        "duration": max(
            [float(seg.get("timestamp", 0.0) or 0.0) for seg in segments] or [0.0]
        ),
        "segments": segments,
        "sources": sources,
        "capability_status": capability_status.model_dump(mode="json"),
        "text_length": len(text),
    }
    return text, details


def extract_plain_text(filepath: str) -> tuple[str, dict[str, Any]] | None:
    ext = Path(filepath).suffix.lower()
    if ext not in _PLAIN_TEXT_EXTENSIONS:
        return None
    text = Path(filepath).read_text(encoding="utf-8", errors="replace")
    return text, {"text_length": len(text)}
