"""Animation compiler package with legacy module-compatible exports."""

from .common import (
    _COLOR_ALIASES,
    _VALID_COLORS,
    _hex_to_rgb,
    _is_light_hex,
    _safe_color,
    _safe_id,
    _safe_str,
)
from .compiler import compile_animation_plan, compile_animation_plan_from_json
from .preflight import preflight_check

__all__ = [
    "compile_animation_plan",
    "compile_animation_plan_from_json",
    "preflight_check",
    "_COLOR_ALIASES",
    "_VALID_COLORS",
    "_hex_to_rgb",
    "_is_light_hex",
    "_safe_color",
    "_safe_id",
    "_safe_str",
]
