"""Animation style-pack and theme resolution."""

from __future__ import annotations

from typing import Any

from .constants import (
    _CAMERA_TYPES,
    _DEFAULT_STYLE_PACK,
    _STYLE_PACK_ALIASES,
    _STYLE_PACK_THEMES,
    DEFAULT_THEME,
)
from .text import _clean_text


def _resolve_style_pack(value: Any) -> str:
    raw = _clean_text(value).lower()
    if raw in _STYLE_PACK_THEMES:
        return raw
    if raw in _STYLE_PACK_ALIASES:
        mapped = _STYLE_PACK_ALIASES[raw]
        if mapped in _STYLE_PACK_THEMES:
            return mapped
    return _DEFAULT_STYLE_PACK


def _resolve_scene_camera(value: Any, *, shot_type: str, index: int) -> str:
    candidate = _clean_text(value).lower()
    if candidate in _CAMERA_TYPES:
        return candidate
    if shot_type == "intro":
        return "wide"
    if shot_type == "summary":
        return "zoom_out"
    focus_cameras = ("medium", "close", "track_left", "track_right", "zoom_in")
    return focus_cameras[(index - 1) % len(focus_cameras)]


def _resolve_theme(style_pack: str, custom_theme: Any) -> dict[str, str]:
    base = dict(
        _STYLE_PACK_THEMES.get(style_pack) or _STYLE_PACK_THEMES[_DEFAULT_STYLE_PACK]
    )
    if isinstance(custom_theme, dict):
        for key, value in custom_theme.items():
            if key in base:
                normalized = _clean_text(value)
                if normalized:
                    base[key] = normalized
    return base
