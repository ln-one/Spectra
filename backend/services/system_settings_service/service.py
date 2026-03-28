from __future__ import annotations

import logging
import os
from copy import deepcopy
from threading import RLock
from typing import Any

from schemas.system_settings import SystemSettingsData, SystemSettingsUpdateRequest

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
        return value if value > 0 else default
    except ValueError:
        return default


class SystemSettingsService:
    """Development-friendly system settings facade.

    Current behavior:
    - reads stable defaults from environment
    - allows runtime overlay updates in memory
    - keeps router/service/schema boundaries explicit

    This is intentionally a foundation layer so later persistence can replace
    the overlay implementation without changing the API surface.
    """

    def __init__(self) -> None:
        self._overlay: dict[str, Any] = {}
        self._lock = RLock()

    def get_settings(self) -> SystemSettingsData:
        merged = self._build_default_payload()
        with self._lock:
            self._deep_merge(merged, deepcopy(self._overlay))
        return SystemSettingsData.model_validate(merged)

    def update_settings(
        self, payload: SystemSettingsUpdateRequest
    ) -> SystemSettingsData:
        patch = payload.model_dump(exclude_none=True)
        if not patch:
            return self.get_settings()

        with self._lock:
            self._deep_merge(self._overlay, patch)
            merged = self._build_default_payload()
            self._deep_merge(merged, deepcopy(self._overlay))
            settings = SystemSettingsData.model_validate(merged)
        self._apply_runtime_effects(settings)
        return settings

    def reset_for_tests(self) -> None:
        with self._lock:
            self._overlay.clear()
            defaults = self._build_default_payload()
            settings = SystemSettingsData.model_validate(defaults)
        self._apply_runtime_effects(settings)

    def _build_default_payload(self) -> dict[str, Any]:
        default_model = os.getenv("DEFAULT_MODEL", "qwen3.5-flash")
        chat_timeout_seconds = _env_int("CHAT_RESPONSE_TIMEOUT_SECONDS", 90)
        return {
            "models": {
                "default_model": default_model,
                "large_model": os.getenv("LARGE_MODEL", default_model),
                "small_model": os.getenv("SMALL_MODEL", default_model),
            },
            "generation_defaults": {
                "default_output_type": "ppt",
                "default_page_count": 12,
                "default_outline_style": "structured",
            },
            "feature_flags": {
                "enable_ai_generation": True,
                "enable_file_upload": True,
                "feature_flags": {
                    "allow_ai_stub": _env_bool("ALLOW_AI_STUB", False),
                    "sync_rag_indexing": _env_bool("SYNC_RAG_INDEXING", False),
                },
            },
            "experience": {
                "chat_timeout_seconds": chat_timeout_seconds,
                "ai_request_timeout_seconds": _env_int(
                    "AI_REQUEST_TIMEOUT_SECONDS", 60
                ),
            },
        }

    def _deep_merge(self, base: dict[str, Any], patch: dict[str, Any]) -> None:
        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                self._deep_merge(base[key], value)
            else:
                base[key] = value

    def _apply_runtime_effects(self, settings: SystemSettingsData) -> None:
        try:
            from services.ai import ai_service

            ai_service.apply_runtime_overrides(
                default_model=settings.models.default_model,
                large_model=settings.models.large_model,
                small_model=settings.models.small_model,
                ai_request_timeout_seconds=(
                    settings.experience.ai_request_timeout_seconds
                ),
                chat_timeout_seconds=settings.experience.chat_timeout_seconds,
            )
        except Exception:
            logger.warning(
                "Failed to apply runtime system settings; "
                "API response remains updated."
            )


system_settings_service = SystemSettingsService()
