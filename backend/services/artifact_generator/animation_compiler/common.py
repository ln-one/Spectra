"""Shared compiler constants and sanitizers."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_VALID_COLORS = {
    "WHITE",
    "BLACK",
    "GRAY",
    "GRAY_A",
    "GRAY_B",
    "GRAY_C",
    "GRAY_D",
    "GRAY_E",
    "RED",
    "RED_A",
    "RED_B",
    "RED_C",
    "RED_D",
    "RED_E",
    "ORANGE",
    "YELLOW",
    "YELLOW_A",
    "YELLOW_B",
    "YELLOW_C",
    "YELLOW_D",
    "YELLOW_E",
    "GREEN",
    "GREEN_A",
    "GREEN_B",
    "GREEN_C",
    "GREEN_D",
    "GREEN_E",
    "LIME_GREEN",
    "BLUE",
    "BLUE_A",
    "BLUE_B",
    "BLUE_C",
    "BLUE_D",
    "BLUE_E",
    "DARK_BLUE",
    "PURPLE",
    "PURPLE_A",
    "PURPLE_B",
    "PURPLE_C",
    "PURPLE_D",
    "PURPLE_E",
    "TEAL",
    "TEAL_A",
    "TEAL_B",
    "TEAL_C",
    "TEAL_D",
    "TEAL_E",
    "MAROON",
    "GOLD",
    "PINK",
}

_COLOR_ALIASES = {
    "LIME": "LIME_GREEN",
    "LIGHT_BLUE": "BLUE_A",
    "LIGHT_GREEN": "GREEN_A",
    "LIGHT_RED": "RED_A",
    "PURPLE_LIGHT": "PURPLE_A",
    "GRAY_LIGHT": "GRAY_A",
    "GRAY_DARK": "GRAY_E",
}


def _safe_color(raw: str) -> str:
    c = raw.strip().upper()
    c = _COLOR_ALIASES.get(c, c)
    return c if c in _VALID_COLORS else "WHITE"


def _safe_id(raw_id: str) -> str:
    """Ensure object ID is a valid Python identifier."""
    import re

    # Replace non-alphanumeric/underscore with underscore
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", raw_id)
    # Prefix with 'obj_' if starts with digit
    if cleaned and cleaned[0].isdigit():
        cleaned = "obj_" + cleaned
    return cleaned or "obj_unknown"


def _safe_str(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int] | None:
    raw = str(hex_color or "").strip().lstrip("#")
    if len(raw) != 6:
        return None
    try:
        return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return None


def _is_light_hex(hex_color: str) -> bool:
    rgb = _hex_to_rgb(hex_color)
    if not rgb:
        return False
    r, g, b = rgb
    # Perceived luminance
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance >= 150
