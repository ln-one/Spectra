from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def _coerce_color(raw: str | None) -> tuple[int, int, int]:
    value = str(raw or "#22c55e").strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        return (34, 197, 94)
    try:
        return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return (34, 197, 94)


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, width: int) -> list[str]:
    words = [segment for segment in str(text or "").split() if segment]
    if not words:
        return [str(text or "").strip()] if str(text or "").strip() else []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        bbox = draw.textbbox((0, 0), candidate)
        if bbox[2] - bbox[0] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _frame_text_lines(content: dict[str, Any]) -> list[tuple[str, str]]:
    scenes = content.get("scenes") or []
    lines: list[tuple[str, str]] = []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        title = str(scene.get("title") or content.get("title") or "Scene").strip()
        description = str(
            scene.get("description")
            or scene.get("summary")
            or content.get("summary")
            or ""
        ).strip()
        lines.append((title, description))
    if lines:
        return lines
    title = str(content.get("title") or "Animation").strip()
    summary = str(content.get("summary") or content.get("scene") or "").strip()
    return [(title, summary or "动画演示已生成")]


def render_storyboard_frames(
    content: dict[str, Any],
    *,
    width: int = 960,
    height: int = 540,
) -> list[Image.Image]:
    accent = _coerce_color(content.get("line_color"))
    title_color = (245, 248, 255)
    body_color = (214, 223, 234)
    bg_start = (11, 15, 25)
    bg_end = (25, 37, 59)
    speed = max(10, min(int(content.get("speed") or 50), 100))
    show_trail = bool(content.get("show_trail", True))
    split_view = bool(content.get("split_view", False))
    scene_lines = _frame_text_lines(content)
    frame_multiplier = 2 if show_trail else 1
    frames: list[Image.Image] = []
    font = ImageFont.load_default()

    for scene_index, (scene_title, scene_description) in enumerate(
        scene_lines, start=1
    ):
        for step in range(frame_multiplier):
            frame = Image.new("RGB", (width, height), bg_start)
            draw = ImageDraw.Draw(frame)
            for y in range(height):
                ratio = y / max(height - 1, 1)
                color = tuple(
                    int(
                        bg_start[channel]
                        + (bg_end[channel] - bg_start[channel]) * ratio
                    )
                    for channel in range(3)
                )
                draw.line((0, y, width, y), fill=color)

            panel_margin = 48
            draw.rounded_rectangle(
                (
                    panel_margin,
                    panel_margin,
                    width - panel_margin,
                    height - panel_margin,
                ),
                radius=28,
                outline=accent,
                width=4,
                fill=(15, 23, 42),
            )

            progress_left = panel_margin + 32
            progress_top = height - 110
            progress_width = width - panel_margin * 2 - 64
            draw.rounded_rectangle(
                (
                    progress_left,
                    progress_top,
                    progress_left + progress_width,
                    progress_top + 16,
                ),
                radius=10,
                fill=(51, 65, 85),
            )
            progress_ratio = min(
                1.0,
                ((scene_index - 1) * frame_multiplier + step + 1)
                / max(len(scene_lines) * frame_multiplier, 1),
            )
            draw.rounded_rectangle(
                (
                    progress_left,
                    progress_top,
                    progress_left + int(progress_width * progress_ratio),
                    progress_top + 16,
                ),
                radius=10,
                fill=accent,
            )

            draw.text(
                (panel_margin + 32, panel_margin + 28),
                scene_title,
                fill=title_color,
                font=font,
            )
            meta_text = (
                f"Scene {scene_index}/{len(scene_lines)}  "
                f"Speed {speed}  "
                f"{'Split' if split_view else 'Single'} View"
            )
            draw.text(
                (panel_margin + 32, panel_margin + 54),
                meta_text,
                fill=body_color,
                font=font,
            )

            text_width = width - panel_margin * 2 - 64
            description_lines = _wrap_text(draw, scene_description, text_width)
            top = panel_margin + 110
            for line in description_lines[:8]:
                draw.text((panel_margin + 32, top), line, fill=body_color, font=font)
                top += 24

            orbit_width = 180 + scene_index * 18
            orbit_height = 110 + step * 18
            orbit_left = width - panel_margin - 260
            orbit_top = panel_margin + 120
            draw.arc(
                (
                    orbit_left,
                    orbit_top,
                    orbit_left + orbit_width,
                    orbit_top + orbit_height,
                ),
                start=0,
                end=300,
                fill=accent,
                width=5,
            )
            dot_x = orbit_left + 24 + int(step * 36 + scene_index * 18)
            dot_y = orbit_top + 40 + int(scene_index * 12)
            draw.ellipse((dot_x, dot_y, dot_x + 18, dot_y + 18), fill=accent)
            if show_trail:
                for offset in range(1, 4):
                    alpha_x = dot_x - offset * 18
                    alpha_y = dot_y + offset * 8
                    fade = tuple(max(0, channel - offset * 35) for channel in accent)
                    draw.ellipse(
                        (alpha_x, alpha_y, alpha_x + 12, alpha_y + 12),
                        fill=fade,
                    )
            if split_view:
                divider_x = width // 2
                draw.line(
                    (
                        divider_x,
                        panel_margin + 90,
                        divider_x,
                        height - panel_margin - 36,
                    ),
                    fill=(71, 85, 105),
                    width=2,
                )

            frames.append(frame)

    return frames or [Image.new("RGB", (width, height), (15, 23, 42))]


def render_gif(content: dict[str, Any], output_path: str) -> str:
    frames = render_storyboard_frames(content)
    duration = max(80, 420 - min(int(content.get("speed") or 50), 100) * 3)
    path = Path(output_path)
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )
    return str(path)


def render_mp4(content: dict[str, Any], output_path: str) -> str:
    try:
        import cv2
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "MP4 rendering requires opencv-python to be installed."
        ) from exc

    frames = render_storyboard_frames(content)
    fps = max(4, min(int(content.get("speed") or 50) // 10, 12))
    width, height = frames[0].size
    path = str(Path(output_path))
    writer = cv2.VideoWriter(
        path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError("Failed to initialize MP4 video writer.")
    try:
        for frame in frames:
            rgb_frame = np.array(frame.convert("RGB"))
            writer.write(cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR))
    finally:
        writer.release()
    return path


def render_preview_png_bytes(content: dict[str, Any]) -> bytes:
    frame = render_storyboard_frames(content)[0]
    buffer = BytesIO()
    frame.save(buffer, format="PNG")
    return buffer.getvalue()
