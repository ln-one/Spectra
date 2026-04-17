"""Manim renderer package with legacy-compatible exports."""

from .code_utils import (
    _build_safe_fallback_code,
    _check_syntax,
    _extract_error_context,
    _extract_json,
    _extract_python_code,
    _safe_text,
    _sanitize_manim_code,
    _scene_step_description,
)
from .codegen import generate_manim_code, repair_manim_code
from .config import (
    _MANIM_RENDER_FPS,
    _MANIM_RENDER_QUALITY,
    _MANIM_RENDERER_BASE_URL,
    _MANIM_RENDERER_ENABLED,
    _MANIM_RENDERER_TIMEOUT,
    _MAX_REPAIR_ATTEMPTS,
)
from .ir_alignment import _align_timeline_with_scenes
from .prompts import (
    _FEWSHOT_EXAMPLES,
    _REPAIR_PROMPT_TEMPLATE,
    _SYSTEM_PROMPT,
    _USER_PROMPT_TEMPLATE,
    _build_generation_prompt,
    _build_ir_prompt,
    _build_repair_prompt,
    _format_objects,
    _format_scenes,
)
from .renderer_client import (
    _call_renderer,
    render_gif_via_manim,
    should_use_manim_renderer,
)

__all__ = [
    "generate_manim_code",
    "repair_manim_code",
    "render_gif_via_manim",
    "should_use_manim_renderer",
    "_align_timeline_with_scenes",
    "_build_ir_prompt",
]
