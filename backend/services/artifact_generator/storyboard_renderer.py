from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

_FONT_CANDIDATE_PATHS = (
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
)


def _load_font(size: int) -> ImageFont.ImageFont:
    for path in _FONT_CANDIDATE_PATHS:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


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


def _wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    width: int,
    *,
    font: ImageFont.ImageFont | None = None,
) -> list[str]:
    words = [segment for segment in str(text or "").split() if segment]
    if not words:
        return [str(text or "").strip()] if str(text or "").strip() else []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        bbox = draw.textbbox((0, 0), candidate, font=font)
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


def _extract_algorithm_frames(content: dict[str, Any]) -> list[dict[str, Any]]:
    runtime_graph = content.get("runtime_graph")
    if isinstance(runtime_graph, dict):
        graph_steps = runtime_graph.get("steps")
        if isinstance(graph_steps, list):
            extracted: list[dict[str, Any]] = []
            for step in graph_steps:
                if not isinstance(step, dict):
                    continue
                caption = step.get("primary_caption")
                title = ""
                body = ""
                if isinstance(caption, dict):
                    title = str(caption.get("title") or "").strip()
                    body = str(caption.get("body") or "").strip()
                bars: list[dict[str, Any]] = []
                entities = step.get("entities")
                if isinstance(entities, list):
                    for entity in entities:
                        if not isinstance(entity, dict):
                            continue
                        if str(entity.get("kind") or "").strip() != "track_stack":
                            continue
                        items = entity.get("items")
                        if not isinstance(items, list):
                            continue
                        for index, item in enumerate(items):
                            if not isinstance(item, dict):
                                continue
                            raw_value = item.get("value")
                            try:
                                value = float(raw_value)
                            except (TypeError, ValueError):
                                continue
                            bars.append(
                                {
                                    "index": index,
                                    "value": value,
                                    "accent": str(item.get("accent") or "muted").strip(),
                                    "label": str(item.get("label") or ""),
                                }
                            )
                if bars:
                    extracted.append(
                        {
                            "title": title,
                            "body": body,
                            "bars": bars,
                        }
                    )
            if extracted:
                return extracted

    raw_steps = content.get("steps")
    if not isinstance(raw_steps, list):
        return []
    extracted: list[dict[str, Any]] = []
    for step in raw_steps:
        if not isinstance(step, dict):
            continue
        snapshot = step.get("snapshot")
        if not isinstance(snapshot, list):
            continue
        active_indices = {
            value for value in (step.get("active_indices") or []) if isinstance(value, int)
        }
        swap_indices = {
            value for value in (step.get("swap_indices") or []) if isinstance(value, int)
        }
        sorted_indices = {
            value for value in (step.get("sorted_indices") or []) if isinstance(value, int)
        }
        action = str(step.get("action") or "").strip().lower()
        bars: list[dict[str, Any]] = []
        for index, raw_value in enumerate(snapshot):
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            accent = "muted"
            if action == "done" or index in sorted_indices:
                accent = "success"
            elif index in swap_indices:
                accent = "swap"
            elif index in active_indices:
                accent = "active"
            bars.append({"index": index, "value": value, "accent": accent, "label": f"#{index}"})
        if not bars:
            continue
        extracted.append(
            {
                "title": str(step.get("title") or action or "").strip(),
                "body": str(step.get("caption") or step.get("description") or "").strip(),
                "bars": bars,
            }
        )
    return extracted


def _accent_color(name: str) -> tuple[int, int, int]:
    if name == "swap":
        return (249, 115, 22)
    if name == "active":
        return (37, 99, 235)
    if name == "success":
        return (5, 150, 105)
    return (100, 116, 139)


def _render_algorithm_frames(
    content: dict[str, Any],
    *,
    width: int,
    height: int,
) -> list[Image.Image]:
    steps = _extract_algorithm_frames(content)
    if not steps:
        return []

    title_text = str(content.get("title") or "Algorithm Demo").strip()
    summary_text = str(content.get("summary") or "").strip()
    title_font = _load_font(34)
    body_font = _load_font(24)
    hint_font = _load_font(20)
    frames: list[Image.Image] = []
    for step_index, step in enumerate(steps, start=1):
        frame = Image.new("RGB", (width, height), (238, 241, 244))
        draw = ImageDraw.Draw(frame)
        card_margin = 36
        card_top = 28
        card_bottom = height - 28
        draw.rounded_rectangle(
            (card_margin, card_top, width - card_margin, card_bottom),
            radius=24,
            fill=(255, 255, 255),
            outline=(203, 213, 225),
            width=3,
        )
        draw.text((64, 56), title_text, fill=(15, 23, 42), font=title_font)
        draw.text(
            (64, 78),
            f"Step {step_index}/{len(steps)}",
            fill=(71, 85, 105),
            font=hint_font,
        )
        sub_title = str(step.get("title") or "").strip()
        if sub_title:
            draw.text((64, 102), sub_title, fill=(30, 41, 59), font=body_font)
        body = str(step.get("body") or summary_text).strip()
        if body:
            wrapped = _wrap_text(draw, body, width - 160, font=hint_font)
            top = 124
            for line in wrapped[:2]:
                draw.text((64, top), line, fill=(71, 85, 105), font=hint_font)
                top += 20

        bars = step.get("bars") if isinstance(step.get("bars"), list) else []
        values = [float(item.get("value") or 0) for item in bars if isinstance(item, dict)]
        max_value = max(values) if values else 1.0
        if max_value <= 0:
            max_value = 1.0
        chart_left = 64
        chart_right = width - 64
        chart_bottom = height - 88
        chart_top = 200
        draw.line((chart_left, chart_bottom, chart_right, chart_bottom), fill=(203, 213, 225), width=2)
        count = max(len(bars), 1)
        bar_gap = 14
        available = chart_right - chart_left - (count - 1) * bar_gap
        bar_width = max(18, int(available / count))
        for index, item in enumerate(bars):
            if not isinstance(item, dict):
                continue
            value = float(item.get("value") or 0)
            accent = str(item.get("accent") or "muted").strip()
            color = _accent_color(accent)
            height_ratio = max(0.08, min(value / max_value, 1.0))
            bar_height = int((chart_bottom - chart_top) * height_ratio)
            left = chart_left + index * (bar_width + bar_gap)
            top = chart_bottom - bar_height
            right = left + bar_width
            draw.rounded_rectangle(
                (left, top, right, chart_bottom),
                radius=10,
                fill=color,
                outline=(255, 255, 255),
                width=1,
            )
            draw.text(
                (left + 2, top - 18),
                str(int(value) if float(value).is_integer() else value),
                fill=(51, 65, 85),
                font=hint_font,
            )
        frames.append(frame)
    return frames


def _resolve_speed(content: dict[str, Any]) -> int:
    raw_speed = content.get("speed")
    if isinstance(raw_speed, (int, float)):
        return max(10, min(int(raw_speed), 100))
    rhythm = str(content.get("rhythm") or "").strip().lower()
    if rhythm == "slow":
        return 28
    if rhythm == "fast":
        return 78
    return 55


def _is_step_mode(content: dict[str, Any]) -> bool:
    explicit = content.get("step_mode")
    if isinstance(explicit, bool):
        return explicit
    if str(content.get("rhythm") or "").strip().lower() == "slow":
        return True
    text = " ".join(
        str(value or "")
        for value in (
            content.get("focus"),
            content.get("motion_brief"),
            content.get("summary"),
            content.get("topic"),
            content.get("title"),
        )
    ).lower()
    return any(keyword in text for keyword in ("一步一步", "逐步", "step by step"))


def render_storyboard_frames(
    content: dict[str, Any],
    *,
    width: int = 960,
    height: int = 540,
) -> list[Image.Image]:
    algorithm_frames = _render_algorithm_frames(content, width=width, height=height)
    if algorithm_frames:
        return algorithm_frames

    accent = _coerce_color(content.get("line_color"))
    title_color = (245, 248, 255)
    body_color = (214, 223, 234)
    bg_start = (11, 15, 25)
    bg_end = (25, 37, 59)
    speed = _resolve_speed(content)
    show_trail = bool(content.get("show_trail", True))
    split_view = bool(content.get("split_view", False))
    scene_lines = _frame_text_lines(content)
    frame_multiplier = 2 if show_trail else 1
    frames: list[Image.Image] = []
    title_font = _load_font(28)
    body_font = _load_font(20)

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
                font=title_font,
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
                font=body_font,
            )

            text_width = width - panel_margin * 2 - 64
            description_lines = _wrap_text(draw, scene_description, text_width, font=body_font)
            top = panel_margin + 110
            for line in description_lines[:8]:
                draw.text((panel_margin + 32, top), line, fill=body_color, font=body_font)
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
    speed = _resolve_speed(content)
    duration = max(90, 520 - speed * 4)
    if _is_step_mode(content):
        duration = max(duration, 900)
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
