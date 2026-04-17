from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

FRAME_WIDTH = 960
FRAME_HEIGHT = 540
FONT_FAMILY_STACK = (
    "'Noto Sans CJK SC', 'WenQuanYi Zen Hei', "
    "'Microsoft YaHei', 'PingFang SC', sans-serif"
)

from .templates import _HTML_TEMPLATE


class AnimationBrowserRenderError(RuntimeError):
    """Raised when browser-based animation rendering fails."""


def build_frame_plan(spec: dict[str, Any]) -> list[dict[str, float | int]]:
    duration_seconds = max(3, min(int(spec.get("duration_seconds") or 6), 20))
    rhythm = str(spec.get("rhythm") or "balanced").strip().lower()
    fps = {"slow": 6, "balanced": 8, "fast": 10}.get(rhythm, 8)
    scenes = spec.get("scenes") or [{}]
    total_frames = max(len(scenes) * 10, min(duration_seconds * fps, 160))
    plan: list[dict[str, float | int]] = []
    for frame_index in range(total_frames):
        global_progress = frame_index / max(total_frames - 1, 1)
        scene_float = global_progress * len(scenes)
        scene_index = min(len(scenes) - 1, int(scene_float))
        scene_progress = scene_float - scene_index
        plan.append(
            {
                "scene_index": scene_index,
                "scene_progress": round(scene_progress, 4),
                "global_progress": round(global_progress, 4),
            }
        )
    return plan


def render_animation_frames(spec: dict[str, Any]) -> list[Image.Image]:
    try:
        from playwright.sync_api import sync_playwright
    except ModuleNotFoundError as exc:
        raise AnimationBrowserRenderError(
            "Playwright is required for browser-based animation rendering."
        ) from exc

    frame_plan = build_frame_plan(spec)
    if not frame_plan:
        raise AnimationBrowserRenderError("Animation frame plan is empty.")

    launch_kwargs: dict[str, Any] = {"headless": True}
    chrome_path = str(os.getenv("CHROME_PATH") or "").strip()
    if chrome_path:
        if Path(chrome_path).exists():
            launch_kwargs["executable_path"] = chrome_path
            launch_kwargs["args"] = ["--no-sandbox", "--disable-setuid-sandbox"]
        else:
            raise AnimationBrowserRenderError(
                f"Configured CHROME_PATH does not exist: {chrome_path}"
            )

    frames: list[Image.Image] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_kwargs)
        try:
            page = browser.new_page(
                viewport={"width": FRAME_WIDTH, "height": FRAME_HEIGHT}
            )
            page.set_content(_HTML_TEMPLATE, wait_until="domcontentloaded")
            page.wait_for_function(
                "() => window.__spectraRendererReady === true", timeout=15_000
            )
            stage = page.locator("#stage")

            for item in frame_plan:
                page.evaluate(
                    """(payload) => window.__spectraRenderFrame(
                        payload.spec,
                        payload.sceneIndex,
                        payload.sceneProgress,
                        payload.globalProgress
                    )""",
                    {
                        "spec": spec,
                        "sceneIndex": item["scene_index"],
                        "sceneProgress": item["scene_progress"],
                        "globalProgress": item["global_progress"],
                    },
                )
                png_bytes = stage.screenshot(type="png")
                frame = Image.open(BytesIO(png_bytes)).convert("RGB")
                frames.append(frame)
        except Exception as exc:
            raise AnimationBrowserRenderError(str(exc)) from exc
        finally:
            browser.close()
    return frames


def render_debug_html(spec: dict[str, Any]) -> str:
    payload = json.dumps(spec, ensure_ascii=False)
    return (
        "<!doctype html><html><head><meta charset='utf-8' /></head><body>"
        "<script>window.__SPECTRA_DEBUG_SPEC__ = "
        + payload
        + ";</script>"
        + _HTML_TEMPLATE
        + "</body></html>"
    )
