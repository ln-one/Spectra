"""
Tests for services/audio_service.py
"""

from __future__ import annotations

import struct
import sys
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_wav(path: Path, frames: int = 16000, framerate: int = 16000) -> None:
    """Write a minimal valid WAV file."""
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(struct.pack(f"<{frames}h", *([0] * frames)))


# ---------------------------------------------------------------------------
# _safe_audio_duration
# ---------------------------------------------------------------------------


def test_safe_audio_duration_valid_wav(tmp_path: Path) -> None:
    from services.media.audio import _safe_audio_duration

    wav_path = tmp_path / "test.wav"
    _make_wav(wav_path, frames=16000, framerate=16000)

    duration = _safe_audio_duration(str(wav_path))
    assert duration == pytest.approx(1.0, abs=0.01)


def test_safe_audio_duration_invalid_file(tmp_path: Path) -> None:
    from services.media.audio import _safe_audio_duration

    bad_path = tmp_path / "not_a_wav.wav"
    bad_path.write_bytes(b"not a real wav file content")

    duration = _safe_audio_duration(str(bad_path))
    assert duration == 0.0


def test_safe_audio_duration_missing_file() -> None:
    from services.media.audio import _safe_audio_duration

    duration = _safe_audio_duration("/nonexistent/path/audio.wav")
    assert duration == 0.0


def test_safe_audio_duration_zero_framerate(tmp_path: Path) -> None:
    """Probe should return 0.0 when getframerate() returns 0."""
    from services.media.audio import _safe_audio_duration

    mock_wav = MagicMock()
    mock_wav.getframerate.return_value = 0
    mock_wav.getnframes.return_value = 1000
    mock_wav.__enter__ = lambda s: s
    mock_wav.__exit__ = MagicMock(return_value=False)

    with patch("wave.open", return_value=mock_wav):
        duration = _safe_audio_duration("any.wav")
    assert duration == 0.0


# ---------------------------------------------------------------------------
# transcribe_audio — faster_whisper NOT installed
# ---------------------------------------------------------------------------


def test_transcribe_audio_no_faster_whisper(tmp_path: Path) -> None:
    """ImportError → returns UNAVAILABLE status."""
    from services.media.audio import transcribe_audio

    wav_path = tmp_path / "clip.wav"
    _make_wav(wav_path)

    # Remove faster_whisper from sys.modules if present, and block import
    with patch.dict(sys.modules, {"faster_whisper": None}):
        text, confidence, duration, status = transcribe_audio(str(wav_path))

    assert text == ""
    assert confidence == 0.0
    assert status.status.value == "unavailable"
    assert status.fallback_used is True
    assert status.fallback_target == "manual_text_input"
    assert status.reason_code is not None
    assert "暂不可用" in (status.user_message or "")


# ---------------------------------------------------------------------------
# transcribe_audio — faster_whisper installed, normal success
# ---------------------------------------------------------------------------


def test_transcribe_audio_success(tmp_path: Path) -> None:
    """Valid segments returned → AVAILABLE status."""
    from services.media.audio import transcribe_audio

    wav_path = tmp_path / "clip.wav"
    _make_wav(wav_path)

    fake_seg = SimpleNamespace(text="  你好世界  ")
    fake_info = SimpleNamespace(language_probability=0.95, duration=1.0)

    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([fake_seg], fake_info)

    mock_whisper_module = MagicMock()
    mock_whisper_module.WhisperModel.return_value = mock_model

    with patch.dict(sys.modules, {"faster_whisper": mock_whisper_module}):
        text, confidence, duration, status = transcribe_audio(str(wav_path))

    assert text == "你好世界"
    assert confidence == pytest.approx(0.95, abs=0.01)
    assert status.status.value == "available"
    assert status.fallback_used is False


# ---------------------------------------------------------------------------
# transcribe_audio — empty segments
# ---------------------------------------------------------------------------


def test_transcribe_audio_empty_output(tmp_path: Path) -> None:
    """Empty segments → DEGRADED + EMPTY_OUTPUT."""
    from services.media.audio import transcribe_audio

    wav_path = tmp_path / "silent.wav"
    _make_wav(wav_path)

    fake_info = SimpleNamespace(language_probability=0.6, duration=2.0)

    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([], fake_info)

    mock_whisper_module = MagicMock()
    mock_whisper_module.WhisperModel.return_value = mock_model

    with patch.dict(sys.modules, {"faster_whisper": mock_whisper_module}):
        text, confidence, duration, status = transcribe_audio(str(wav_path))

    assert text == ""
    assert status.status.value == "degraded"
    assert status.reason_code is not None
    assert status.reason_code.value == "EMPTY_OUTPUT"


# ---------------------------------------------------------------------------
# transcribe_audio — unexpected exception
# ---------------------------------------------------------------------------


def test_transcribe_audio_exception(tmp_path: Path) -> None:
    """Runtime exception → DEGRADED status with non-empty user_message."""
    from services.media.audio import transcribe_audio

    wav_path = tmp_path / "clip.wav"
    _make_wav(wav_path)

    mock_model = MagicMock()
    mock_model.transcribe.side_effect = RuntimeError("GPU out of memory")

    mock_whisper_module = MagicMock()
    mock_whisper_module.WhisperModel.return_value = mock_model

    with patch.dict(sys.modules, {"faster_whisper": mock_whisper_module}):
        text, confidence, duration, status = transcribe_audio(str(wav_path))

    assert text == ""
    assert status.status.value == "degraded"
    assert status.user_message is not None


# ---------------------------------------------------------------------------
# transcribe_audio — timeout mapped to PROVIDER_TIMEOUT
# ---------------------------------------------------------------------------


def test_transcribe_audio_timeout_reason_code(tmp_path: Path) -> None:
    """Exception containing 'timeout' → reason_code=PROVIDER_TIMEOUT."""
    from services.media.audio import transcribe_audio

    wav_path = tmp_path / "clip.wav"
    _make_wav(wav_path)

    mock_model = MagicMock()
    mock_model.transcribe.side_effect = TimeoutError("request timeout exceeded")

    mock_whisper_module = MagicMock()
    mock_whisper_module.WhisperModel.return_value = mock_model

    with patch.dict(sys.modules, {"faster_whisper": mock_whisper_module}):
        text, confidence, duration, status = transcribe_audio(str(wav_path))

    assert status.reason_code is not None
    assert status.reason_code.value == "PROVIDER_TIMEOUT"
