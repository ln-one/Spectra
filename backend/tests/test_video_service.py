"""
Tests for services/video_service.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# process_video — no DASHSCOPE_API_KEY
# ---------------------------------------------------------------------------


def test_process_video_no_api_key(tmp_path: Path, monkeypatch) -> None:
    """Missing API key → DEGRADED + fallback segment returned."""
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)

    video_path = tmp_path / "lecture.mp4"
    video_path.write_bytes(b"fake video bytes")

    from services.video_service import process_video

    segments, status = process_video(str(video_path), "lecture.mp4")

    assert len(segments) == 1
    assert "lecture.mp4" in segments[0]["content"]
    assert status.status.value == "degraded"
    assert status.fallback_used is True
    assert status.fallback_target == "metadata_parser"
    assert status.reason_code is not None


# ---------------------------------------------------------------------------
# process_video — dashscope not installed
# ---------------------------------------------------------------------------


def test_process_video_dashscope_not_installed(tmp_path: Path, monkeypatch) -> None:
    """ImportError on dashscope → DEGRADED fallback."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-test-key")

    video_path = tmp_path / "lesson.mp4"
    video_path.write_bytes(b"fake video bytes")

    with patch.dict(sys.modules, {"dashscope": None}):
        from importlib import reload

        import services.video_service as vsvc

        reload(vsvc)
        segments, status = vsvc.process_video(str(video_path), "lesson.mp4")

    assert status.status.value == "degraded"
    assert len(segments) >= 1


# ---------------------------------------------------------------------------
# process_video — successful Qwen-VL response
# ---------------------------------------------------------------------------


def _make_qwen_response(text: str) -> MagicMock:
    """Build a minimal mock MultiModalConversation response."""
    content_item = {"text": text}
    message_mock = {"content": [content_item]}
    choice_mock = {"message": message_mock}
    output_mock = SimpleNamespace(choices=[choice_mock])
    response = SimpleNamespace(output=output_mock)
    return response


def test_process_video_success(tmp_path: Path, monkeypatch) -> None:
    """Valid Qwen-VL response → AVAILABLE status with real content."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-test-key")

    video_path = tmp_path / "class.mp4"
    video_path.write_bytes(b"fake video bytes")

    mock_dashscope = MagicMock()
    mock_dashscope.MultiModalConversation.call.return_value = _make_qwen_response(
        "这是一段关于Python编程的教程视频。"
    )

    with patch.dict(sys.modules, {"dashscope": mock_dashscope}):
        from importlib import reload

        import services.video_service as vsvc

        reload(vsvc)
        segments, status = vsvc.process_video(str(video_path), "class.mp4")

    assert status.status.value == "available"
    assert status.fallback_used is False
    assert len(segments) == 1
    assert "Python" in segments[0]["content"]
    assert segments[0]["timestamp"] == 0.0


# ---------------------------------------------------------------------------
# process_video — empty Qwen-VL response
# ---------------------------------------------------------------------------


def test_process_video_empty_response(tmp_path: Path, monkeypatch) -> None:
    """Empty response from Qwen-VL → DEGRADED fallback segment."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-test-key")

    video_path = tmp_path / "empty.mp4"
    video_path.write_bytes(b"fake video bytes")

    empty_output = SimpleNamespace(choices=[])
    mock_dashscope = MagicMock()
    mock_dashscope.MultiModalConversation.call.return_value = SimpleNamespace(
        output=empty_output
    )

    with patch.dict(sys.modules, {"dashscope": mock_dashscope}):
        from importlib import reload

        import services.video_service as vsvc

        reload(vsvc)
        segments, status = vsvc.process_video(str(video_path), "empty.mp4")

    assert status.status.value == "degraded"
    assert len(segments) == 1


# ---------------------------------------------------------------------------
# create_video_sources
# ---------------------------------------------------------------------------


def test_create_video_sources_basic() -> None:
    """create_video_sources converts segment dicts to SourceReference list."""
    from services.video_service import create_video_sources

    segments = [
        {
            "timestamp": 10.5,
            "content": "讲解数据结构的内容片段。",
            "confidence": 0.9,
            "chunk_id": "vid_abc123",
        }
    ]
    sources = create_video_sources(segments, "lecture.mp4")

    assert len(sources) == 1
    src = sources[0]
    assert src.chunk_id == "vid_abc123"
    assert src.source_type.value == "video"
    assert src.filename == "lecture.mp4"
    assert src.timestamp == pytest.approx(10.5)
    assert "数据结构" in (src.content_preview or "")


def test_create_video_sources_empty_segments() -> None:
    from services.video_service import create_video_sources

    sources = create_video_sources([], "empty.mp4")
    assert sources == []


def test_create_video_sources_missing_chunk_id() -> None:
    """Segment without chunk_id should auto-generate one."""
    from services.video_service import create_video_sources

    segments = [{"timestamp": 0.0, "content": "测试内容", "confidence": 0.8}]
    sources = create_video_sources(segments, "test.mp4")

    assert len(sources) == 1
    assert sources[0].chunk_id.startswith("vid_")
