from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from services.artifact_generator.animation_spec import normalize_animation_spec
from services.artifact_generator.html_animation_renderer import (
    AnimationBrowserRenderError,
    build_frame_plan,
    render_animation_frames,
)


def _render_animation_frames_with_browser(spec: dict[str, Any]) -> list[Image.Image]:
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(render_animation_frames, spec)
        return future.result()


def _coerce_color(
    raw: str | None, default: tuple[int, int, int]
) -> tuple[int, int, int]:
    value = str(raw or "").strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        return default
    try:
        return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return default


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, width: int) -> list[str]:
    content = str(text or "").strip()
    if not content:
        return []
    tokens = re.split(r"(\s+)", content)
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = f"{current}{token}"
        bbox = draw.textbbox((0, 0), candidate)
        if current and bbox[2] - bbox[0] > width:
            lines.append(current.strip())
            current = token
        else:
            current = candidate
    if current.strip():
        lines.append(current.strip())
    return lines


def _render_process_frame(
    draw: ImageDraw.ImageDraw,
    spec: dict[str, Any],
    scene_index: int,
    scene: dict[str, Any],
    *,
    width: int,
    height: int,
) -> None:
    accent = _coerce_color(spec["theme"].get("accent"), (22, 163, 74))
    accent_soft = _coerce_color(spec["theme"].get("accent_soft"), (134, 239, 172))
    text = _coerce_color(spec["theme"].get("text"), (16, 35, 26))
    muted = _coerce_color(spec["theme"].get("muted"), (95, 118, 104))
    panel_alt = _coerce_color(spec["theme"].get("panel_alt"), (232, 246, 238))
    font = ImageFont.load_default()

    scenes = spec.get("scenes") or [scene]
    count = len(scenes)
    card = (64, 176, width - 64, height - 80)
    draw.rounded_rectangle(card, radius=28, fill=(255, 255, 255), outline=accent_soft)
    start_x = 138
    end_x = width - 138
    gap = (end_x - start_x) // max(count - 1, 1)
    for index, item in enumerate(scenes):
        cx = start_x + gap * index if count > 1 else width // 2
        cy = 276
        active = index == scene_index
        if index > 0:
            draw.line(
                (cx - gap + 28, cy, cx - 28, cy),
                fill=accent_soft,
                width=8,
            )
        draw.ellipse(
            (cx - 28, cy - 28, cx + 28, cy + 28),
            fill=accent if active else panel_alt,
            outline=accent,
            width=3,
        )
        draw.text(
            (cx - 5, cy - 7),
            str(index + 1),
            fill=(255, 255, 255) if active else text,
            font=font,
        )
        draw.text(
            (cx - 32, cy + 42),
            str(item.get("title") or f"步骤 {index + 1}")[:10],
            fill=text,
            font=font,
        )

    draw.text((96, 336), "当前表现重点", fill=accent, font=font)
    description_lines = _wrap_text(draw, scene.get("description") or "", width - 180)
    top = 364
    for line in description_lines[:3]:
        draw.text((96, top), line, fill=text, font=font)
        top += 24
    for point in (scene.get("key_points") or [])[:3]:
        draw.ellipse(
            (96, top + 4, 106, top + 14),
            fill=_coerce_color(spec["theme"].get("highlight"), (245, 158, 11)),
        )
        draw.text((118, top), str(point), fill=muted, font=font)
        top += 24


def _render_relationship_frame(
    draw: ImageDraw.ImageDraw,
    spec: dict[str, Any],
    scene_index: int,
    scene: dict[str, Any],
    *,
    width: int,
    height: int,
) -> None:
    accent = _coerce_color(spec["theme"].get("accent"), (22, 163, 74))
    accent_soft = _coerce_color(spec["theme"].get("accent_soft"), (134, 239, 172))
    highlight = _coerce_color(spec["theme"].get("highlight"), (245, 158, 11))
    text = _coerce_color(spec["theme"].get("text"), (16, 35, 26))
    muted = _coerce_color(spec["theme"].get("muted"), (95, 118, 104))
    font = ImageFont.load_default()

    draw.rounded_rectangle(
        (64, 176, 624, height - 80),
        radius=28,
        fill=(255, 255, 255),
        outline=accent_soft,
    )
    draw.rounded_rectangle(
        (648, 176, width - 64, height - 80),
        radius=28,
        fill=(255, 250, 237),
        outline=highlight,
    )
    draw.line((118, 220, 118, 392), fill=accent_soft, width=4)
    draw.line((118, 392, 560, 392), fill=accent_soft, width=4)
    values = [0.18, 0.34, 0.52 + scene_index * 0.04, 0.74]
    points: list[tuple[int, int]] = []
    for index, value in enumerate(values):
        x = 128 + index * 130
        y = int(382 - value * 180)
        points.append((x, y))
    draw.line(points, fill=accent, width=6, joint="curve")
    for index, (x, y) in enumerate(points):
        radius = 12 if index == min(scene_index, len(points) - 1) else 9
        fill = highlight if index == min(scene_index, len(points) - 1) else accent
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)
        draw.text((x - 4, 410), str(index + 1), fill=muted, font=font)
    draw.text((690, 216), "变化解读", fill=text, font=font)
    draw.text(
        (690, 248), str(scene.get("description") or "")[:32], fill=accent, font=font
    )
    top = 286
    for point in (scene.get("key_points") or [])[:3]:
        draw.text((690, top), f"* {point}"[:28], fill=muted, font=font)
        top += 24


def _render_structure_frame(
    draw: ImageDraw.ImageDraw,
    spec: dict[str, Any],
    scene_index: int,
    scene: dict[str, Any],
    *,
    width: int,
    height: int,
) -> None:
    accent = _coerce_color(spec["theme"].get("accent"), (22, 163, 74))
    accent_soft = _coerce_color(spec["theme"].get("accent_soft"), (134, 239, 172))
    text = _coerce_color(spec["theme"].get("text"), (16, 35, 26))
    font = ImageFont.load_default()
    scenes = (spec.get("scenes") or [scene])[:3]
    draw.rounded_rectangle(
        (64, 176, width - 64, height - 80),
        radius=28,
        fill=(255, 255, 255),
        outline=accent_soft,
    )
    for index, item in enumerate(scenes):
        x = 112 + index * 248
        y = 216 if index == scene_index else 226
        draw.rounded_rectangle(
            (x, y, x + 196, y + 176),
            radius=24,
            fill=(232, 246, 238) if index == scene_index else (255, 255, 255),
            outline=accent,
            width=3,
        )
        draw.rounded_rectangle(
            (x + 22, y + 22, x + 92, y + 92),
            radius=18,
            fill=accent if index == scene_index else accent_soft,
        )
        draw.text(
            (x + 22, y + 122),
            str(item.get("title") or f"部分 {index + 1}")[:12],
            fill=text,
            font=font,
        )
    draw.text(
        (96, 428), str(scene.get("description") or "")[:44], fill=accent, font=font
    )


def render_storyboard_frames(
    content: dict[str, Any],
    *,
    width: int = 960,
    height: int = 540,
) -> list[Image.Image]:
    spec = normalize_animation_spec(content)
    frame_plan = build_frame_plan(spec)
    theme = spec["theme"]
    background = _coerce_color(theme.get("background"), (245, 248, 243))
    panel_alt = _coerce_color(theme.get("panel_alt"), (232, 246, 238))
    text = _coerce_color(theme.get("text"), (16, 35, 26))
    muted = _coerce_color(theme.get("muted"), (95, 118, 104))
    accent = _coerce_color(theme.get("accent"), (22, 163, 74))
    font = ImageFont.load_default()
    frames: list[Image.Image] = []

    for item in frame_plan:
        scene_index = int(item["scene_index"])
        scene = spec["scenes"][scene_index]
        frame = Image.new("RGB", (width, height), background)
        draw = ImageDraw.Draw(frame)
        draw.ellipse((740, 60, 900, 220), fill=panel_alt)
        draw.ellipse((620, 380, 770, 520), fill=(224, 244, 232))
        draw.text((88, 84), spec["title"], fill=text, font=font)
        draw.text((88, 118), spec["teaching_goal"][:56], fill=muted, font=font)
        draw.rounded_rectangle((88, 462, 872, 478), radius=8, fill=(216, 231, 220))
        progress_width = max(32, int(784 * float(item["global_progress"])))
        draw.rounded_rectangle(
            (88, 462, 88 + progress_width, 478), radius=8, fill=accent
        )
        draw.rounded_rectangle(
            (88, 56, 226, 92), radius=18, fill=(232, 246, 238), outline=(214, 234, 221)
        )
        draw.text((108, 68), scene["title"][:18], fill=accent, font=font)

        visual_type = spec["visual_type"]
        if visual_type == "relationship_change":
            _render_relationship_frame(
                draw, spec, scene_index, scene, width=width, height=height
            )
        elif visual_type == "structure_breakdown":
            _render_structure_frame(
                draw, spec, scene_index, scene, width=width, height=height
            )
        else:
            _render_process_frame(
                draw, spec, scene_index, scene, width=width, height=height
            )
        frames.append(frame)

    return frames or [Image.new("RGB", (width, height), background)]


def _prepare_gif_frames(
    frames: list[Image.Image], *, rhythm: str
) -> tuple[list[Image.Image], list[int]]:
    if not frames:
        raise RuntimeError("No frames available for GIF rendering.")

    hold_count = {"slow": 5, "balanced": 4, "fast": 3}.get(rhythm, 4)
    base_duration = {"slow": 180, "balanced": 130, "fast": 100}.get(rhythm, 130)
    tail_duration = {"slow": 240, "balanced": 220, "fast": 180}.get(rhythm, 220)

    extended_frames = [frame.convert("RGB") for frame in frames]
    extended_frames.extend(frames[-1].convert("RGB").copy() for _ in range(hold_count))

    adaptive_palette = getattr(getattr(Image, "Palette", Image), "ADAPTIVE", None)
    if adaptive_palette is None:
        adaptive_palette = getattr(Image, "ADAPTIVE", 1)
    palette_seed = extended_frames[0].convert("P", palette=adaptive_palette, colors=255)
    dither_none = getattr(getattr(Image, "Dither", Image), "NONE", 0)
    quantized_frames = [
        frame.quantize(palette=palette_seed, dither=dither_none)
        for frame in extended_frames
    ]
    durations = [base_duration] * len(frames) + [tail_duration] * hold_count
    return quantized_frames, durations


def render_gif(content: dict[str, Any], output_path: str) -> str:
    spec = normalize_animation_spec(content)
    try:
        frames = _render_animation_frames_with_browser(spec)
    except AnimationBrowserRenderError:
        frames = render_storyboard_frames(spec)

    frames_to_save, durations = _prepare_gif_frames(
        frames, rhythm=str(spec.get("rhythm") or "balanced")
    )
    path = Path(output_path)
    frames_to_save[0].save(
        path,
        save_all=True,
        append_images=frames_to_save[1:],
        duration=durations,
        disposal=2,
        optimize=False,
    )
    return str(path)


def render_mp4(content: dict[str, Any], output_path: str) -> str:
    try:
        import cv2
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "MP4 rendering requires opencv-python to be installed."
        ) from exc

    spec = normalize_animation_spec(content)
    try:
        frames = _render_animation_frames_with_browser(spec)
    except AnimationBrowserRenderError:
        frames = render_storyboard_frames(spec)
    fps = {"slow": 6, "balanced": 8, "fast": 10}.get(spec.get("rhythm"), 8)
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
    spec = normalize_animation_spec(content)
    try:
        frame = _render_animation_frames_with_browser(spec)[0]
    except AnimationBrowserRenderError:
        frame = render_storyboard_frames(spec)[0]
    buffer = BytesIO()
    frame.save(buffer, format="PNG")
    return buffer.getvalue()
