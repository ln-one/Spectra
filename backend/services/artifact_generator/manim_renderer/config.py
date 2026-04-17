"""Manim renderer runtime config."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_MANIM_RENDERER_BASE_URL = os.getenv(
    "MANIM_RENDERER_BASE_URL", "http://manim-renderer:8120"
)

_MANIM_RENDERER_TIMEOUT = float(os.getenv("MANIM_RENDERER_TIMEOUT_SECONDS", "150"))

_MANIM_RENDERER_ENABLED = os.getenv("MANIM_RENDERER_ENABLED", "false").lower() == "true"

_MANIM_RENDER_QUALITY = str(os.getenv("MANIM_RENDER_QUALITY", "m")).strip() or "m"

_MANIM_RENDER_FPS = int(os.getenv("MANIM_RENDER_FPS", "24"))

_MAX_REPAIR_ATTEMPTS = 0  # 当前无 LLM Python repair，仅主渲染一次
