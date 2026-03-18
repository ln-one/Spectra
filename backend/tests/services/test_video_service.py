"""Tests for services/video_service.py."""

from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

from services.video_service import create_video_sources, process_video


def test_process_video_degraded_when_api_key_missing(monkeypatch):
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)

    segments, status = process_video("fake.mp4", "lesson.mp4")

    assert len(segments) == 1
    assert segments[0]["content"]
    assert status.capability.value == "video_understanding"
    assert status.status.value == "degraded"
    assert status.fallback_used is True
    assert status.fallback_target == "metadata_parser"
    assert status.reason_code is not None
    assert status.reason_code.value == "PROVIDER_UNAVAILABLE"


def test_process_video_success_with_mocked_dashscope(monkeypatch):
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

    fake_response = SimpleNamespace(
        output=SimpleNamespace(
            choices=[
                {"message": {"content": [{"text": "这是可用于课件的关键讲解片段。"}]}}
            ]
        )
    )
    fake_module = MagicMock()
    fake_module.MultiModalConversation.call.return_value = fake_response
    monkeypatch.setitem(sys.modules, "dashscope", fake_module)

    segments, status = process_video("fake.mp4", "lesson.mp4")

    assert len(segments) == 1
    assert "关键讲解片段" in segments[0]["content"]
    assert status.status.value == "available"
    assert status.fallback_used is False


def test_process_video_degraded_on_empty_output(monkeypatch):
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")

    fake_response = SimpleNamespace(
        output=SimpleNamespace(
            choices=[{"message": {"content": [{"text": "   "}]}}],
        )
    )
    fake_module = MagicMock()
    fake_module.MultiModalConversation.call.return_value = fake_response
    monkeypatch.setitem(sys.modules, "dashscope", fake_module)

    segments, status = process_video("fake.mp4", "lesson.mp4")

    assert len(segments) == 1
    assert status.status.value == "degraded"
    assert status.reason_code is not None
    assert status.reason_code.value == "EMPTY_OUTPUT"


def test_create_video_sources_maps_required_fields():
    segments = [
        {
            "chunk_id": "vid-1",
            "timestamp": 12.3,
            "content": "测试片段内容",
        }
    ]

    sources = create_video_sources(segments, "lesson.mp4")

    assert len(sources) == 1
    assert sources[0].chunk_id == "vid-1"
    assert sources[0].source_type.value == "video"
    assert sources[0].filename == "lesson.mp4"
    assert sources[0].timestamp == 12.3
    assert "测试片段内容" in (sources[0].content_preview or "")
