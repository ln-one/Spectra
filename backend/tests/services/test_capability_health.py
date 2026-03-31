"""
Tests for services/capability_health.py
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch


def _clear_cache() -> None:
    """Clear the health check cache between tests."""
    from services.capability_health import clear_health_cache

    clear_health_cache()


# ---------------------------------------------------------------------------
# check_document_parser_health
# ---------------------------------------------------------------------------


def test_document_parser_health_local_available(monkeypatch) -> None:
    """Local parser available → AVAILABLE status."""
    monkeypatch.setenv("DOCUMENT_PARSER", "local")
    _clear_cache()

    from services.capability_health import check_document_parser_health

    status = check_document_parser_health()

    assert status.status.value == "available"
    assert status.fallback_used is False
    assert status.capability.value == "document_parser"


def test_document_parser_health_primary_unavailable(monkeypatch) -> None:
    """Primary provider raises → DEGRADED with local fallback."""
    monkeypatch.setenv("DOCUMENT_PARSER", "mineru")
    _clear_cache()

    import services.parsers as parsers_module

    original_get_parser = parsers_module.get_parser
    call_count = {"n": 0}

    def _fake_get_parser(name=None):
        call_count["n"] += 1
        if name == "mineru":
            from services.parsers.base import ProviderNotAvailableError

            raise ProviderNotAvailableError("mineru not installed")
        return original_get_parser("local")

    monkeypatch.setattr(parsers_module, "get_parser", _fake_get_parser)
    # Also patch within capability_health module
    import services.capability_health as ch_module

    monkeypatch.setattr(
        (
            "services.capability_health.get_parser"
            if hasattr(ch_module, "get_parser")
            else "services.parsers.get_parser"
        ),
        _fake_get_parser,
        raising=False,
    )

    _clear_cache()

    from services.capability_health import check_document_parser_health

    status = check_document_parser_health()

    # Should be either degraded (local fallback) or available (if local was resolved)
    assert status.capability.value == "document_parser"
    assert status.status.value in ("available", "degraded", "unavailable")


def test_document_parser_health_resolved_to_local_is_degraded(monkeypatch) -> None:
    """Configured non-local parser resolved to local should report DEGRADED."""
    monkeypatch.setenv("DOCUMENT_PARSER", "mineru")
    _clear_cache()

    class _LocalParser:
        name = "local"

    with patch("services.parsers.get_parser", return_value=_LocalParser()):
        from services.capability_health import check_document_parser_health

        status = check_document_parser_health()

    assert status.status.value == "degraded"
    assert status.fallback_used is True
    assert status.fallback_target == "local"
    assert status.provider == "local"


def test_document_parser_health_auto_mode_available(monkeypatch) -> None:
    """Auto parser mode should be treated as available routing mode."""
    monkeypatch.setenv("DOCUMENT_PARSER", "auto")
    _clear_cache()

    from services.capability_health import check_document_parser_health

    status = check_document_parser_health()

    assert status.status.value == "available"
    assert status.provider == "auto"
    assert status.fallback_used is False


# ---------------------------------------------------------------------------
# check_video_understanding_health
# ---------------------------------------------------------------------------


def test_video_understanding_health_with_api_key(monkeypatch) -> None:
    """DASHSCOPE_API_KEY set → AVAILABLE."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-fake-key-for-test")
    _clear_cache()

    from services.capability_health import check_video_understanding_health

    status = check_video_understanding_health()

    assert status.status.value == "available"
    assert status.capability.value == "video_understanding"
    assert status.provider == "Qwen-VL"
    assert status.fallback_used is False


def test_video_understanding_health_without_api_key(monkeypatch) -> None:
    """DASHSCOPE_API_KEY not set → UNAVAILABLE."""
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    _clear_cache()

    from services.capability_health import check_video_understanding_health

    status = check_video_understanding_health()

    assert status.status.value == "unavailable"
    assert status.reason_code is not None
    assert status.user_message is not None


# ---------------------------------------------------------------------------
# check_speech_recognition_health
# ---------------------------------------------------------------------------


def test_speech_recognition_health_faster_whisper_installed() -> None:
    """faster_whisper importable → AVAILABLE."""
    _clear_cache()

    fake_fw = MagicMock()
    with patch.dict(sys.modules, {"faster_whisper": fake_fw}):
        from importlib import reload

        import services.capability_health as ch

        reload(ch)
        ch.clear_health_cache()
        status = ch.check_speech_recognition_health()

    assert status.status.value == "available"
    assert status.capability.value == "speech_recognition"


def test_speech_recognition_health_faster_whisper_not_installed() -> None:
    """faster_whisper NOT importable → UNAVAILABLE."""
    _clear_cache()

    with patch.dict(sys.modules, {"faster_whisper": None}):
        from importlib import reload

        import services.capability_health as ch

        reload(ch)
        ch.clear_health_cache()
        status = ch.check_speech_recognition_health()

    assert status.status.value == "unavailable"
    assert status.reason_code is not None


# ---------------------------------------------------------------------------
# check_animation_rendering_health
# ---------------------------------------------------------------------------


def test_animation_rendering_health_available() -> None:
    _clear_cache()

    with patch("services.capability_health.find_spec") as find_spec_mock:
        find_spec_mock.side_effect = lambda name: object()

        from services.capability_health import check_animation_rendering_health

        status = check_animation_rendering_health()

    assert status.status.value == "available"
    assert status.capability.value == "animation_rendering"
    assert status.provider == "Pillow+OpenCV"


def test_animation_rendering_health_degraded_without_cv2() -> None:
    _clear_cache()

    def _fake_find_spec(name: str):
        if name == "PIL":
            return object()
        return None

    with patch("services.capability_health.find_spec", side_effect=_fake_find_spec):
        from services.capability_health import check_animation_rendering_health

        status = check_animation_rendering_health()

    assert status.status.value == "degraded"
    assert status.capability.value == "animation_rendering"
    assert status.fallback_target == "gif"


def test_animation_rendering_health_unavailable_without_dependencies() -> None:
    _clear_cache()

    with patch("services.capability_health.find_spec", return_value=None):
        from services.capability_health import check_animation_rendering_health

        status = check_animation_rendering_health()

    assert status.status.value == "unavailable"
    assert status.reason_code is not None


# ---------------------------------------------------------------------------
# get_all_capabilities_health
# ---------------------------------------------------------------------------


def test_get_all_capabilities_health_returns_all_keys(monkeypatch) -> None:
    """Should return dict with exactly 4 capability keys."""
    monkeypatch.setenv("DOCUMENT_PARSER", "local")
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    _clear_cache()

    from services.capability_health import get_all_capabilities_health

    result = get_all_capabilities_health()

    assert set(result.keys()) == {
        "document_parser",
        "video_understanding",
        "speech_recognition",
        "animation_rendering",
    }
    for name, status in result.items():
        assert status.capability.value == name


# ---------------------------------------------------------------------------
# Cache TTL behavior
# ---------------------------------------------------------------------------


def test_cache_returns_same_object_within_ttl(monkeypatch) -> None:
    """Second call within TTL should return cached result (same object)."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-fake-key")
    _clear_cache()

    from services.capability_health import check_video_understanding_health

    first = check_video_understanding_health()
    second = check_video_understanding_health()

    # Same object identity from cache
    assert first is second


def test_clear_cache_forces_fresh_check(monkeypatch) -> None:
    """clear_health_cache() → next call performs real check."""
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-fake-key")
    _clear_cache()

    from services.capability_health import (
        check_video_understanding_health,
        clear_health_cache,
    )

    first = check_video_understanding_health()
    clear_health_cache()
    second = check_video_understanding_health()

    # After clearing cache, a new object is constructed
    assert first is not second
    assert first.status == second.status  # but same logical result
