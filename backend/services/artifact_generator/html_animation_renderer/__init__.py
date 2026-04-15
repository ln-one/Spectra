"""HTML animation rendering package.

The public names mirror the historical ``html_animation_renderer.py`` module.
"""

from .renderer import (
    FONT_FAMILY_STACK,
    FRAME_HEIGHT,
    FRAME_WIDTH,
    AnimationBrowserRenderError,
    build_frame_plan,
    render_animation_frames,
    render_debug_html,
)
from .templates import _HTML_TEMPLATE

__all__ = [
    "FRAME_HEIGHT",
    "FRAME_WIDTH",
    "FONT_FAMILY_STACK",
    "AnimationBrowserRenderError",
    "_HTML_TEMPLATE",
    "build_frame_plan",
    "render_animation_frames",
    "render_debug_html",
]
