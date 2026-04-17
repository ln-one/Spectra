"""HTTP client and public Manim render entrypoint."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from .code_utils import _build_safe_fallback_code
from .codegen import generate_manim_code
from .config import (
    _MANIM_RENDER_FPS,
    _MANIM_RENDER_QUALITY,
    _MANIM_RENDERER_BASE_URL,
    _MANIM_RENDERER_ENABLED,
    _MANIM_RENDERER_TIMEOUT,
    _MAX_REPAIR_ATTEMPTS,
    logger,
)


async def _call_renderer(
    code: str,
    scene_name: str = "GeneratedScene",
    output_format: str = "gif",
    quality: str = _MANIM_RENDER_QUALITY,
    fps: int = _MANIM_RENDER_FPS,
) -> bytes:
    """POST to manim-renderer service and return raw file bytes."""
    url = f"{_MANIM_RENDERER_BASE_URL.rstrip('/')}/render"
    payload = {
        "code": code,
        "scene_name": scene_name,
        "output_format": output_format,
        "quality": quality,
        "fps": fps,
    }
    async with httpx.AsyncClient(timeout=_MANIM_RENDERER_TIMEOUT) as client:
        response = await client.post(url, json=payload)

    if response.status_code == 400:
        raise ValueError(f"Renderer rejected code: {response.text[:400]}")
    if response.status_code != 200:
        raise RuntimeError(
            f"Renderer error {response.status_code}: {response.text[:400]}"
        )
    return response.content


def should_use_manim_renderer(content: dict[str, Any]) -> bool:
    """Return True if the Manim renderer should be used for this request."""
    render_mode = str(content.get("render_mode") or "").strip().lower()
    # Explicit opt-in should always take effect.
    if render_mode == "manim":
        return True
    # cloud_video_wan goes to Aliyun, never Manim.
    if render_mode == "cloud_video_wan":
        return False
    # Auto mode: when enabled, intercept all GIF requests.
    if _MANIM_RENDERER_ENABLED:
        return True
    return False


async def render_gif_via_manim(
    content: dict[str, Any],
    storage_path: str,
) -> str:
    """Generate a GIF using Manim, with one automatic LLM repair attempt on failure.

    Returns the path to the saved GIF file.
    Falls back silently by raising RuntimeError so the caller can use the
    legacy SVG renderer instead.
    """
    from services.artifact_generator.animation_spec import normalize_animation_spec

    spec = normalize_animation_spec(content)

    # Step 1: Generate Manim code via LLM
    code = await generate_manim_code(spec)
    if not code:
        raise RuntimeError("LLM returned empty Manim code")

    # Step 2: Try rendering (single attempt, no LLM repair)
    render_error: str | None = None
    try:
        gif_bytes = await _call_renderer(
            code=code,
            scene_name="GeneratedScene",
            output_format="gif",
            quality=_MANIM_RENDER_QUALITY,
            fps=_MANIM_RENDER_FPS,
        )
        # Success: write to storage path
        path = Path(storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gif_bytes)
        logger.info(
            "render_gif_via_manim: saved gif size=%d path=%s",
            len(gif_bytes),
            storage_path,
        )
        return str(path)

    except (ValueError, RuntimeError) as exc:
        render_error = str(exc)
        logger.warning("render_gif_via_manim: rendering failed: %s", render_error)

    # Step 3: Deterministic fallback inside Manim path (avoid dropping to SVG)
    logger.warning(
        "render_gif_via_manim: LLM code failed after %d attempt(s), "
        "trying deterministic fallback scene",
        _MAX_REPAIR_ATTEMPTS + 1,
    )
    fallback_code = _build_safe_fallback_code(spec)
    try:
        gif_bytes = await _call_renderer(
            code=fallback_code,
            scene_name="GeneratedScene",
            output_format="gif",
            quality=_MANIM_RENDER_QUALITY,
            fps=_MANIM_RENDER_FPS,
        )
        path = Path(storage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gif_bytes)
        logger.info(
            "render_gif_via_manim: deterministic fallback saved gif size=%d path=%s",
            len(gif_bytes),
            storage_path,
        )
        return str(path)
    except Exception as fallback_exc:
        raise RuntimeError(
            f"Manim render failed after {_MAX_REPAIR_ATTEMPTS + 1} attempt(s). "
            f"Last error: {render_error}; fallback_error: {fallback_exc}"
        ) from fallback_exc
